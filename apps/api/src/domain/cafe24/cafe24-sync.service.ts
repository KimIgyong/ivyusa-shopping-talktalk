import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INTEGRATION_PROVIDER, internalToUiStatus } from '@ivy/types';
import { OrderCache } from '../order/entity/order-cache.entity';
import { CustomerService } from '../customer/customer.service';
import { Cafe24TokenService } from './cafe24-token.service';
import { Cafe24AdminClient, Cafe24Order } from './cafe24-admin.client';

const CAFE24 = INTEGRATION_PROVIDER.CAFE24;
const DEFAULT_LOOKBACK_DAYS = 7;
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

export interface Cafe24SyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

/**
 * Pulls a Cafe24 mall's orders into orders_cache (provider='cafe24') so the chat
 * AI grounds on them exactly as it does for Shopify. Read-only + idempotent upsert.
 * PLN-260807 P-A1.
 */
@Injectable()
export class Cafe24SyncService {
  private readonly logger = new Logger(Cafe24SyncService.name);

  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    private readonly tokenService: Cafe24TokenService,
    private readonly client: Cafe24AdminClient,
    private readonly customerService: CustomerService,
  ) {}

  async syncOrders(tenantId: number, lookbackDays = DEFAULT_LOOKBACK_DAYS): Promise<Cafe24SyncResult> {
    const conn = await this.tokenService.getConnection(tenantId);
    if (!conn) {
      return { ok: false, synced: 0, detail: 'Cafe24 store is not connected — reconnect the mall' };
    }
    const end = new Date();
    const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60_000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    let synced = 0;
    let pages = 0;
    try {
      for (let offset = 0; pages < MAX_PAGES; offset += PAGE_LIMIT, pages++) {
        const orders = await this.client.pullOrders(conn.mallId, conn.accessToken, {
          startDate,
          endDate,
          limit: PAGE_LIMIT,
          offset,
        });
        for (const o of orders) {
          try {
            await this.upsertOrder(tenantId, o);
            synced++;
          } catch (e) {
            this.logger.warn(`Skipped Cafe24 order ${o.order_id}: ${(e as Error).message}`);
          }
        }
        if (orders.length < PAGE_LIMIT) break; // last page
      }
    } catch (e) {
      if (synced === 0) return { ok: false, synced: 0, detail: `Sync failed: ${(e as Error).message}` };
      return { ok: true, synced, detail: `Synced ${synced} order(s), interrupted: ${(e as Error).message}` };
    }
    return { ok: true, synced, detail: `Synced ${synced} order(s) (${startDate}~${endDate})` };
  }

  /** Map a Cafe24 order → orders_cache (+ email-linked customer). Idempotent. */
  private async upsertOrder(tenantId: number, o: Cafe24Order): Promise<void> {
    let customerId: number | null = null;
    const email = o.member_email ?? null;
    if (email) {
      const name = o.billing_name ?? undefined;
      const customer = await this.customerService.findOrCreateByEmail(tenantId, email, name);
      if (customer) customerId = customer.id;
    }

    const internal = this.client.deriveInternalStatus(o.items);
    const externalId = String(o.order_id);
    let row = await this.orderRepo.findOne({
      where: { tenantId, provider: CAFE24, shopifyOrderId: externalId },
    });
    if (!row) {
      row = this.orderRepo.create({ provider: CAFE24, shopifyOrderId: externalId });
    }
    row.tenantId = tenantId;
    // Never downgrade a known customer link to null (an order re-pull can arrive
    // without the buyer email); keep what we knew.
    row.customerId = customerId ?? row.customerId ?? null;
    row.orderNumber = externalId;
    row.statusInternal = internal;
    row.statusUi = internalToUiStatus(internal);
    row.total = this.client.orderTotal(o);
    row.currency = o.currency ?? row.currency ?? 'KRW';
    await this.orderRepo.save(row);
  }
}
