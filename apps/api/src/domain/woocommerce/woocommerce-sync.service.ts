import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INTEGRATION_PROVIDER, ORDER_STATUS_INTERNAL, internalToUiStatus } from '@ivy/types';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { CustomerService } from '../customer/customer.service';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { IntegrationService } from '../integration/integration.service';
import { parseProviderConfig } from '../ecommerce/provider-config.util';
import { WooClient, WooConfig, WooOrder } from './woocommerce.client';

const WOO = INTEGRATION_PROVIDER.WOOCOMMERCE;
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

export interface WooSyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

/**
 * WooCommerce orders → orders_cache (provider='woocommerce') + order_items +
 * customers. Buyers materialize from the order's billing email — the same shape
 * as every other channel (REQ-260826).
 */
@Injectable()
export class WooSyncService {
  private readonly logger = new Logger(WooSyncService.name);

  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(IntegrationCredential) private readonly credRepo: Repository<IntegrationCredential>,
    private readonly client: WooClient,
    private readonly customerService: CustomerService,
    private readonly integration: IntegrationService,
  ) {}

  private async getConfig(tenantId: number): Promise<WooConfig | null> {
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: WOO } });
    return parseProviderConfig<WooConfig>(cred?.secretEnc, ['store_url', 'consumer_key', 'consumer_secret']);
  }

  async syncOrders(tenantId: number): Promise<WooSyncResult> {
    const config = await this.getConfig(tenantId);
    if (!config) return { ok: false, synced: 0, detail: 'WooCommerce is not connected — fill in and save the credentials first' };

    let synced = 0;
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const orders = await this.client.pullOrders(config, { page, limit: PAGE_LIMIT });
        if (orders.length === 0) break;
        for (const o of orders) {
          try { await this.upsertOrder(tenantId, o); synced++; }
          catch (e) { this.logger.warn(`Skipped Woo order ${o.id}: ${(e as Error).message}`); }
        }
        if (orders.length < PAGE_LIMIT) break;
      }
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`woocommerce order sync tenant ${tenantId} failed: ${message}`);
      await this.integration.upsert(WOO, synced > 0 ? 'connected' : 'error', message);
      if (synced === 0) return { ok: false, synced: 0, detail: `Sync failed: ${message}` };
      return { ok: true, synced, detail: `Synced ${synced} order(s), interrupted: ${message}` };
    }

    this.logger.log(`woocommerce order sync tenant ${tenantId}: ${synced} synced`);
    await this.integration.upsert(WOO, 'connected', `Synced ${synced} order(s)`);
    return { ok: true, synced, detail: `Synced ${synced} order(s)` };
  }

  private async upsertOrder(tenantId: number, o: WooOrder): Promise<void> {
    const email = o.billing?.email ? String(o.billing.email) : null;
    const name = o.billing ? [o.billing.first_name, o.billing.last_name].filter(Boolean).join(' ') || undefined : undefined;

    let customerId: number | null = null;
    if (email) {
      const customer = await this.customerService.findOrCreateByEmail(tenantId, email, name);
      if (customer) customerId = customer.id;
    }

    const internal = mapStatus(o.status);
    const externalId = String(o.id);
    let row = await this.orderRepo.findOne({ where: { tenantId, provider: WOO, shopifyOrderId: externalId } });
    if (!row) row = this.orderRepo.create({ provider: WOO, shopifyOrderId: externalId });
    row.tenantId = tenantId;
    row.customerId = customerId ?? row.customerId ?? null;
    row.memberId = o.customer_id ? `woo-${o.customer_id}` : row.memberId ?? null;
    row.orderNumber = String(o.number || externalId).slice(0, 32);
    row.statusInternal = internal;
    row.statusUi = internalToUiStatus(internal);
    row.total = toNumber(o.total) ?? row.total ?? null;
    row.currency = (o.currency ? String(o.currency).slice(0, 8) : row.currency) ?? 'USD';
    row.orderedAt = o.date_created ? new Date(o.date_created) : row.orderedAt ?? null;
    const saved = await this.orderRepo.save(row);
    await this.syncLineItems(tenantId, saved.id, o.line_items);
  }

  private async syncLineItems(tenantId: number, orderId: number, items: WooOrder['line_items']): Promise<void> {
    if (items == null) return;
    try {
      const rows = items.map((it) =>
        this.itemRepo.create({
          tenantId,
          orderId,
          productId: it.product_id != null ? String(it.product_id) : null,
          title: (it.name ?? '').slice(0, 255) || 'Item',
          optionText: null,
          qty: it.quantity != null && it.quantity > 0 ? it.quantity : 1,
          price: toNumber(it.total),
        }),
      );
      await this.itemRepo.delete({ orderId });
      if (rows.length) await this.itemRepo.save(rows);
    } catch (e) {
      this.logger.warn(`Line items for Woo order ${orderId} not cached: ${(e as Error).message}`);
    }
  }
}

/** WooCommerce order status → internal status. */
function mapStatus(status: string | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
      return ORDER_STATUS_INTERNAL.DELIVERED;
    case 'processing':
      return ORDER_STATUS_INTERNAL.PAID;
    case 'on-hold':
    case 'pending':
      return ORDER_STATUS_INTERNAL.PENDING_PAYMENT;
    case 'cancelled':
    case 'refunded':
    case 'failed':
      return ORDER_STATUS_INTERNAL.CANCEL_REQUESTED;
    default:
      return ORDER_STATUS_INTERNAL.PAID;
  }
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
