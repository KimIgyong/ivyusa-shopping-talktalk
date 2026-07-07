import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ORDER_STATUS_INTERNAL, internalToUiStatus } from '@ivy/types';
import { OrderCache } from './entity/order-cache.entity';
import { ShopifyAdminClient, ShopifyOrderDto } from './shopify-admin.client';
import { TenantService } from '../tenant/tenant.service';
import { CustomerService } from '../customer/customer.service';
import { IntegrationService } from '../integration/integration.service';

const SHOPIFY = 'shopify';

/** Shopify topic → our webhook path (under /api/v1/webhooks/shopify/). */
const WEBHOOK_TOPICS: Array<{ topic: string; path: string }> = [
  { topic: 'orders/create', path: 'orders/create' },
  { topic: 'orders/updated', path: 'orders/updated' },
  { topic: 'fulfillments/create', path: 'fulfillments/create' },
  { topic: 'fulfillments/update', path: 'fulfillments/update' },
];

export interface ShopifySyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

export interface ShopifyWebhookRegisterResult {
  ok: boolean;
  registered: number;
  existing: number;
  failed: number;
  detail: string;
}

/**
 * Pulls orders (and their customers) from the Shopify Admin API into the local
 * cache (orders_cache / customers). On-demand; records the result in
 * integration_status. Fail-safe: any error → 'error', partial rows are kept.
 */
@Injectable()
export class ShopifySyncService {
  private readonly logger = new Logger(ShopifySyncService.name);

  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    private readonly client: ShopifyAdminClient,
    private readonly tenantService: TenantService,
    private readonly customerService: CustomerService,
    private readonly integrationService: IntegrationService,
  ) {}

  async syncOrders(tenantId: number): Promise<ShopifySyncResult> {
    const conn = await this.tenantService.getShopifyConnection(tenantId);
    if (!conn) {
      return this.record(
        false,
        0,
        'Shopify shop domain or a valid access token is missing — reconnect the store',
      );
    }

    let orders: ShopifyOrderDto[];
    try {
      orders = await this.client.fetchOrders(conn.shopDomain, conn.token);
    } catch (e) {
      return this.record(false, 0, `Sync failed: ${(e as Error).message}`);
    }

    let synced = 0;
    for (const order of orders) {
      try {
        await this.upsertOrder(tenantId, order);
        synced++;
      } catch (e) {
        this.logger.warn(`Skipped order ${order.id}: ${(e as Error).message}`);
      }
    }
    return this.record(true, synced, `Synced ${synced} order(s)`);
  }

  /**
   * Subscribe the store to our order/fulfillment webhooks (uses the stored token).
   * Idempotent — a topic already subscribed counts as 'existing', not a failure.
   * Note: HMAC verification needs SHOPIFY_WEBHOOK_SECRET = the app's API secret key.
   */
  async registerWebhooks(tenantId: number): Promise<ShopifyWebhookRegisterResult> {
    const conn = await this.tenantService.getShopifyConnection(tenantId);
    if (!conn) {
      return {
        ok: false,
        registered: 0,
        existing: 0,
        failed: 0,
        detail: 'Shopify credential missing or invalid — reconnect the store',
      };
    }
    const base = (process.env.SHOPIFY_APP_URL ?? '').replace(/\/+$/, '');
    if (!base) {
      return {
        ok: false,
        registered: 0,
        existing: 0,
        failed: 0,
        detail: 'SHOPIFY_APP_URL is not set (needed for the webhook address)',
      };
    }

    let registered = 0;
    let existing = 0;
    let failed = 0;
    for (const { topic, path } of WEBHOOK_TOPICS) {
      const address = `${base}/api/v1/webhooks/shopify/${path}`;
      try {
        const r = await this.client.createWebhook(conn.shopDomain, conn.token, topic, address);
        if (r === 'created') registered++;
        else existing++;
      } catch (e) {
        failed++;
        this.logger.warn(`Register webhook ${topic} failed: ${(e as Error).message}`);
      }
    }
    return {
      ok: failed === 0,
      registered,
      existing,
      failed,
      detail: `Registered ${registered}, already present ${existing}, failed ${failed}`,
    };
  }

  /** Map a Shopify order → orders_cache (+ linked customer). Public: reused by webhooks. */
  async upsertOrder(tenantId: number, o: ShopifyOrderDto): Promise<OrderCache> {
    let customerId: number | null = null;
    const email = o.customer?.email ?? o.email ?? null;
    if (email) {
      const name =
        [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || undefined;
      const shopifyCustomerId = o.customer?.id != null ? String(o.customer.id) : undefined;
      const customer = await this.customerService.findOrCreateByEmail(
        tenantId,
        email,
        name,
        shopifyCustomerId,
      );
      customerId = customer.id;
    }

    const internal = this.mapStatus(o.financial_status, o.fulfillment_status);
    const shopifyOrderId = String(o.id);
    const orderNumber = o.order_number != null ? String(o.order_number) : o.name ?? shopifyOrderId;
    const total =
      o.total_price != null && o.total_price !== '' && !Number.isNaN(Number(o.total_price))
        ? Number(o.total_price)
        : null;

    let row = await this.orderRepo.findOne({ where: { shopifyOrderId } });
    if (!row) {
      row = this.orderRepo.create({ shopifyOrderId });
    }
    row.tenantId = tenantId;
    row.customerId = customerId;
    row.orderNumber = orderNumber;
    row.statusInternal = internal;
    row.statusUi = internalToUiStatus(internal);
    row.total = total;
    row.currency = o.currency ?? row.currency ?? 'USD';
    return this.orderRepo.save(row);
  }

  /**
   * Shopify order rollup → internal status (POL-014 progression).
   * fulfilled → shipping (In Transit); partially fulfilled → preparing;
   * otherwise (paid/unfulfilled or pending) → paid (Confirmed). Delivered is only
   * reached via fulfillment webhooks (shipment_status=delivered).
   */
  private mapStatus(_financial?: string | null, fulfillment?: string | null): string {
    if (fulfillment === 'fulfilled') return ORDER_STATUS_INTERNAL.SHIPPING;
    if (fulfillment === 'partial') return ORDER_STATUS_INTERNAL.PREPARING;
    return ORDER_STATUS_INTERNAL.PAID;
  }

  private async record(ok: boolean, synced: number, detail: string): Promise<ShopifySyncResult> {
    await this.integrationService.upsert(SHOPIFY, ok ? 'connected' : 'error', detail.slice(0, 255));
    return { ok, synced, detail };
  }
}
