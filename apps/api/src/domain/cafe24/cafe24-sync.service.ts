import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INTEGRATION_PROVIDER, internalToUiStatus } from '@ivy/types';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { CustomerService } from '../customer/customer.service';
import { TenantService } from '../tenant/tenant.service';
import { expectedMallIdForTenant } from './cafe24-mall';
import { Cafe24TokenService } from './cafe24-token.service';
import { Cafe24AdminClient, Cafe24Order, Cafe24OrderItem } from './cafe24-admin.client';

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
 * PLN-260807 P-A1; member linking reworked by PLN-260808-Cafe24-MemberId-RecentOrders:
 * orders match customers by member_id (stamped from the customer token's `user_id`)
 * — no /customersprivacy (mall.read_personal) round-trips.
 */
@Injectable()
export class Cafe24SyncService {
  private readonly logger = new Logger(Cafe24SyncService.name);

  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    private readonly tokenService: Cafe24TokenService,
    private readonly client: Cafe24AdminClient,
    private readonly customerService: CustomerService,
    private readonly tenantService: TenantService,
  ) {}

  async syncOrders(tenantId: number, lookbackDays = DEFAULT_LOOKBACK_DAYS): Promise<Cafe24SyncResult> {
    const conn = await this.tokenService.getConnection(tenantId);
    if (!conn) {
      return { ok: false, synced: 0, detail: 'Cafe24 store is not connected — reconnect the mall' };
    }

    // Refuse to pull a mall that is not this tenant's own. amoebaorder held a
    // credential for the `annehearts` mall, and this loop happily cached 65 of
    // another merchant's orders under it — 17 of them already bound to
    // amoebaorder customers (REQ-260819). The check only fires when the tenant
    // has a verifiable *.cafe24.com storefront that DISAGREES; a custom domain
    // yields null and syncs as before.
    const tenant = await this.tenantService.findById(tenantId);
    const expected = expectedMallIdForTenant(tenant);
    if (expected && expected !== conn.mallId) {
      const detail =
        `refusing to sync: tenant runs on ${expected}.cafe24.com but the stored ` +
        `credential is for "${conn.mallId}" — reconnect this store to its own mall`;
      this.logger.error(`Cafe24 sync tenant ${tenantId}: ${detail}`);
      return { ok: false, synced: 0, detail };
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

  /** Map a Cafe24 order → orders_cache + order_items (+ member-linked customer). Idempotent. */
  private async upsertOrder(tenantId: number, o: Cafe24Order): Promise<void> {
    const memberId = o.member_id?.trim() || null;
    const email = o.member_email ?? null;
    const name = o.billing_name ?? undefined;

    // Link priority: ① a customer already stamped with this member_id (sign-in or a
    // prior email sync), ② the order's own email — stamping member_id there too so
    // the next pull hits ①, ③ unresolved: keep member_id on the ROW and let the
    // member's first sign-in retro-link it (adoptCafe24MemberId).
    let customerId: number | null = null;
    if (memberId) {
      const byMember = await this.customerService.findByCafe24MemberId(tenantId, memberId);
      if (byMember) customerId = byMember.id;
    }
    if (customerId == null && email) {
      const customer = await this.customerService.linkCafe24Customer(tenantId, email, name, null);
      if (customer) {
        customerId = customer.id;
        if (memberId && customer.cafe24MemberId !== memberId) {
          await this.customerService.adoptCafe24MemberId(tenantId, customer.id, memberId);
        }
      }
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
    row.memberId = memberId ?? row.memberId ?? null;
    row.orderNumber = externalId;
    row.statusInternal = internal;
    row.statusUi = internalToUiStatus(internal);
    row.total = this.client.orderTotal(o);
    row.currency = o.currency ?? row.currency ?? 'KRW';
    row.orderedAt = parseOrderDate(o.order_date) ?? row.orderedAt ?? null;
    const saved = await this.orderRepo.save(row);
    await this.syncLineItems(tenantId, saved.id, o.items);
  }

  /**
   * Mirror the order's items into order_items so the widget shows WHAT was bought
   * (same contract as the Shopify path). Replace-on-write; `items` absent leaves
   * existing rows untouched; never fatal — a failure here must not lose the order.
   */
  private async syncLineItems(
    tenantId: number,
    orderId: number,
    items: Cafe24OrderItem[] | undefined,
  ): Promise<void> {
    if (items == null) return;
    try {
      const rows = items.map((it) =>
        this.itemRepo.create({
          tenantId,
          orderId,
          productId: it.product_no != null ? String(it.product_no) : null,
          title: (it.product_name ?? '').slice(0, 255) || 'Item',
          // variant_code is an opaque code (P000…), not shopper-readable — omit.
          optionText: null,
          qty: it.quantity != null && it.quantity > 0 ? it.quantity : 1,
          price:
            it.product_price != null &&
            it.product_price !== '' &&
            !Number.isNaN(Number(it.product_price))
              ? Number(it.product_price)
              : null,
        }),
      );
      await this.itemRepo.delete({ orderId });
      if (rows.length) await this.itemRepo.save(rows);
    } catch (e) {
      this.logger.warn(`Line items for Cafe24 order ${orderId} not cached: ${(e as Error).message}`);
    }
  }
}

/** Cafe24 order_date (ISO-ish, +09:00 offset) → Date, or null when absent/garbage. */
function parseOrderDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
