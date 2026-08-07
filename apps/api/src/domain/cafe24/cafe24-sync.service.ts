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

    // Per-run cache: one member places many orders, and the member→user_identifier
    // admin lookup is rate-limited — resolve each member_id at most once per sync.
    const memberCache = new Map<
      string,
      { userIdentifier: string | null; email: string | null; name: string | null } | null
    >();
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
            await this.upsertOrder(tenantId, o, conn, memberCache);
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

  /** Map a Cafe24 order → orders_cache (+ member-linked customer). Idempotent. */
  private async upsertOrder(
    tenantId: number,
    o: Cafe24Order,
    conn: { mallId: string; accessToken: string },
    memberCache: Map<
      string,
      { userIdentifier: string | null; email: string | null; name: string | null } | null
    >,
  ): Promise<void> {
    let customerId: number | null = null;
    // Resolve the member's user_identifier (J1 join key) + profile from member_id,
    // once per member per run. Falls back to the order's own email when the lookup
    // yields nothing (guest checkout, or read_customer not yet granted).
    let profile: { userIdentifier: string | null; email: string | null; name: string | null } | null =
      null;
    const memberId = o.member_id?.trim() || null;
    if (memberId) {
      if (!memberCache.has(memberId)) {
        try {
          memberCache.set(
            memberId,
            await this.client.fetchCustomerByMemberId(conn.mallId, conn.accessToken, memberId),
          );
        } catch (e) {
          memberCache.set(memberId, null);
          this.logger.debug(`member lookup failed member_id=${memberId}: ${(e as Error).message}`);
        }
      }
      profile = memberCache.get(memberId) ?? null;
    }
    const email = o.member_email ?? profile?.email ?? null;
    const name = o.billing_name ?? profile?.name ?? undefined;
    const userIdentifier = profile?.userIdentifier ?? null;
    if (email) {
      // Stamps the user_identifier onto the customer and merges any identifier-only
      // row the sign-in created, so the widget's session inherits these orders.
      const customer = await this.customerService.linkCafe24Customer(
        tenantId,
        email,
        name,
        userIdentifier,
      );
      if (customer) customerId = customer.id;
    } else if (userIdentifier) {
      const customer = await this.customerService.findOrCreateByCafe24Identifier(
        tenantId,
        userIdentifier,
      );
      customerId = customer.id;
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
