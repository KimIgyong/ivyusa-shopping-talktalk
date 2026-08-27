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
import { HaravanClient, HaravanConfig, HaravanOrder } from './haravan.client';

const HARAVAN = INTEGRATION_PROVIDER.HARAVAN;
const PAGE_LIMIT = 250;
const MAX_PAGES = 100;

export interface HaravanSyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

/**
 * Haravan orders → orders_cache (provider='haravan') + order_items + customers.
 * Shopify-compatible API, so the mapping mirrors the Shopify order sync
 * (fulfilled → In Transit, else Confirmed) and buyers materialize from the
 * order's customer email — same as every other channel (REQ-260826).
 */
@Injectable()
export class HaravanSyncService {
  private readonly logger = new Logger(HaravanSyncService.name);

  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
    private readonly client: HaravanClient,
    private readonly customerService: CustomerService,
    private readonly integration: IntegrationService,
  ) {}

  private async getConfig(tenantId: number): Promise<HaravanConfig | null> {
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: HARAVAN } });
    return parseProviderConfig<HaravanConfig>(cred?.secretEnc, ['shop_domain', 'access_token']);
  }

  async syncOrders(tenantId: number): Promise<HaravanSyncResult> {
    const config = await this.getConfig(tenantId);
    if (!config) return { ok: false, synced: 0, detail: 'Haravan is not connected — fill in and save the credentials first' };

    let synced = 0;
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const orders = await this.client.pullOrders(config, { page, limit: PAGE_LIMIT });
        if (orders.length === 0) break;
        for (const o of orders) {
          try {
            await this.upsertOrder(tenantId, o);
            synced++;
          } catch (e) {
            this.logger.warn(`Skipped Haravan order ${o.id}: ${(e as Error).message}`);
          }
        }
        if (orders.length < PAGE_LIMIT) break;
      }
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`haravan order sync tenant ${tenantId} failed: ${message}`);
      await this.integration.upsert(HARAVAN, synced > 0 ? 'connected' : 'error', message);
      if (synced === 0) return { ok: false, synced: 0, detail: `Sync failed: ${message}` };
      return { ok: true, synced, detail: `Synced ${synced} order(s), interrupted: ${message}` };
    }

    this.logger.log(`haravan order sync tenant ${tenantId}: ${synced} synced`);
    await this.integration.upsert(HARAVAN, 'connected', `Synced ${synced} order(s)`);
    return { ok: true, synced, detail: `Synced ${synced} order(s)` };
  }

  private async upsertOrder(tenantId: number, o: HaravanOrder): Promise<void> {
    const email =
      (o.customer?.email && String(o.customer.email)) || o.email || o.contact_email || null;
    const name = o.customer
      ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(' ') || undefined
      : undefined;

    let customerId: number | null = null;
    if (email) {
      const customer = await this.customerService.findOrCreateByEmail(tenantId, email, name);
      if (customer) customerId = customer.id;
    }

    const internal = mapStatus(o);
    const externalId = String(o.id);
    let row = await this.orderRepo.findOne({ where: { tenantId, provider: HARAVAN, shopifyOrderId: externalId } });
    if (!row) row = this.orderRepo.create({ provider: HARAVAN, shopifyOrderId: externalId });
    row.tenantId = tenantId;
    row.customerId = customerId ?? row.customerId ?? null;
    row.memberId = o.customer?.id != null ? `haravan-${o.customer.id}` : row.memberId ?? null;
    row.orderNumber = String(o.name || o.order_number || externalId).slice(0, 32);
    row.statusInternal = internal;
    row.statusUi = internalToUiStatus(internal);
    row.total = toNumber(o.total_price) ?? row.total ?? null;
    row.currency = (o.currency ? String(o.currency).slice(0, 8) : row.currency) ?? 'USD';
    row.orderedAt = o.created_at ? new Date(o.created_at) : row.orderedAt ?? null;
    const saved = await this.orderRepo.save(row);
    await this.syncLineItems(tenantId, saved.id, o.line_items);
  }

  private async syncLineItems(tenantId: number, orderId: number, items: HaravanOrder['line_items']): Promise<void> {
    if (items == null) return;
    try {
      const rows = items.map((it) =>
        this.itemRepo.create({
          tenantId,
          orderId,
          productId: it.product_id != null ? String(it.product_id) : null,
          title: (it.title ?? '').slice(0, 255) || 'Item',
          optionText: it.variant_title ? String(it.variant_title).slice(0, 255) : null,
          qty: it.quantity != null && it.quantity > 0 ? it.quantity : 1,
          price: toNumber(it.price),
        }),
      );
      await this.itemRepo.delete({ orderId });
      if (rows.length) await this.itemRepo.save(rows);
    } catch (e) {
      this.logger.warn(`Line items for Haravan order ${orderId} not cached: ${(e as Error).message}`);
    }
  }
}

/** Haravan (Shopify-shaped) order → internal status. Cancelled wins; else fulfilment rollup. */
function mapStatus(o: HaravanOrder): string {
  if (o.cancelled_at || o.financial_status === 'cancelled') return ORDER_STATUS_INTERNAL.CANCEL_REQUESTED;
  const f = (o.fulfillment_status ?? '').toLowerCase();
  if (f === 'fulfilled') return ORDER_STATUS_INTERNAL.SHIPPING;
  if (f === 'partial' || f === 'partially_fulfilled') return ORDER_STATUS_INTERNAL.PREPARING;
  return ORDER_STATUS_INTERNAL.PAID;
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
