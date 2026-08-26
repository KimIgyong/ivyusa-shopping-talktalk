import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INTEGRATION_PROVIDER, ORDER_STATUS_INTERNAL, internalToUiStatus } from '@ivy/types';
import { OrderCache } from '../order/entity/order-cache.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { CustomerService } from '../customer/customer.service';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { decryptSecret } from '../../global/util/crypto.util';
import { IntegrationService } from '../integration/integration.service';
import { OdooClient, OdooConfig, OdooOrder, OdooOrderLine } from './odoo.client';

const ODOO = INTEGRATION_PROVIDER.ODOO;
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

export interface OdooSyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

/**
 * Pulls a gif2box-style Odoo shop's confirmed orders into orders_cache
 * (provider='odoo') + order_items, and materializes each buyer as a Customer —
 * the same shape the Cafe24/Shopify order syncs produce, so the widget's
 * "my orders" and the customers list light up unchanged (REQ-260826, W3).
 *
 * Read-only against Odoo + idempotent upsert. Customers are a side-effect of
 * orders (Odoo has no separate bulk-customer pull here): a buyer with an email
 * on their res.partner becomes a Customer row linked to the order; a guest
 * ("Public user") order syncs with no customer link, exactly like a Shopify
 * guest order.
 */
@Injectable()
export class OdooSyncService {
  private readonly logger = new Logger(OdooSyncService.name);

  constructor(
    @InjectRepository(OrderCache) private readonly orderRepo: Repository<OrderCache>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
    private readonly client: OdooClient,
    private readonly customerService: CustomerService,
    private readonly integration: IntegrationService,
  ) {}

  private async getConfig(tenantId: number): Promise<OdooConfig | null> {
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: ODOO } });
    if (!cred?.secretEnc) return null;
    try {
      const c = JSON.parse(decryptSecret(cred.secretEnc)) as Partial<OdooConfig>;
      if (!c.url || !c.db || !c.username || !c.api_key) return null;
      return c as OdooConfig;
    } catch {
      return null;
    }
  }

  async syncOrders(tenantId: number): Promise<OdooSyncResult> {
    const config = await this.getConfig(tenantId);
    if (!config) {
      return { ok: false, synced: 0, detail: 'Odoo is not connected — fill in and save the credentials first' };
    }

    let synced = 0;
    try {
      const uid = await this.client.authenticate(config);
      for (let page = 0; page < MAX_PAGES; page++) {
        const orders = await this.client.pullOrders(config, uid, {
          offset: page * PAGE_LIMIT,
          limit: PAGE_LIMIT,
        });
        if (orders.length === 0) break;

        // Batch the two dependent reads for the whole page (one call each).
        const partnerIds = [
          ...new Set(orders.map((o) => partnerId(o)).filter((id): id is number => id != null)),
        ];
        const orderIds = orders.map((o) => o.id);
        const partners = new Map(
          (await this.client.pullPartners(config, uid, partnerIds)).map((p) => [p.id, p]),
        );
        const linesByOrder = groupLines(await this.client.pullOrderLines(config, uid, orderIds));

        for (const o of orders) {
          try {
            await this.upsertOrder(tenantId, o, partners, linesByOrder.get(o.id) ?? []);
            synced++;
          } catch (e) {
            this.logger.warn(`Skipped Odoo order ${o.id}: ${(e as Error).message}`);
          }
        }
        if (orders.length < PAGE_LIMIT) break;
      }
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`odoo order sync tenant ${tenantId} failed: ${message}`);
      await this.integration.upsert(ODOO, synced > 0 ? 'connected' : 'error', message);
      if (synced === 0) return { ok: false, synced: 0, detail: `Sync failed: ${message}` };
      return { ok: true, synced, detail: `Synced ${synced} order(s), interrupted: ${message}` };
    }

    this.logger.log(`odoo order sync tenant ${tenantId}: ${synced} synced`);
    await this.integration.upsert(ODOO, 'connected', `Synced ${synced} order(s)`);
    return { ok: true, synced, detail: `Synced ${synced} order(s)` };
  }

  /** Map an Odoo order → orders_cache + order_items (+ email-linked customer). Idempotent. */
  private async upsertOrder(
    tenantId: number,
    o: OdooOrder,
    partners: Map<number, { name?: string; email?: string | false }>,
    lines: OdooOrderLine[],
  ): Promise<void> {
    const pid = partnerId(o);
    const partner = pid != null ? partners.get(pid) : undefined;
    const email = partner && typeof partner.email === 'string' && partner.email ? partner.email : null;
    const name = partner?.name ?? undefined;

    let customerId: number | null = null;
    if (email) {
      const customer = await this.customerService.findOrCreateByEmail(tenantId, email, name);
      if (customer) customerId = customer.id;
    }

    const internal = mapState(o.state);
    const externalId = String(o.id);
    let row = await this.orderRepo.findOne({
      where: { tenantId, provider: ODOO, shopifyOrderId: externalId },
    });
    if (!row) row = this.orderRepo.create({ provider: ODOO, shopifyOrderId: externalId });
    row.tenantId = tenantId;
    // Never downgrade a known customer link to null (a re-pull can miss the email).
    row.customerId = customerId ?? row.customerId ?? null;
    // The Odoo partner id as a stable external ref on the order.
    row.memberId = pid != null ? `odoo-${pid}` : row.memberId ?? null;
    row.orderNumber = String(o.name || externalId).slice(0, 32);
    row.statusInternal = internal;
    row.statusUi = internalToUiStatus(internal);
    row.total = typeof o.amount_total === 'number' ? o.amount_total : row.total ?? null;
    row.currency = (Array.isArray(o.currency_id) ? String(o.currency_id[1]).slice(0, 8) : row.currency) ?? 'USD';
    row.orderedAt = parseOdooDate(o.date_order) ?? row.orderedAt ?? null;
    const saved = await this.orderRepo.save(row);
    await this.syncLineItems(tenantId, saved.id, lines);
  }

  /** Mirror the order's lines into order_items (replace-on-write, never fatal). */
  private async syncLineItems(tenantId: number, orderId: number, lines: OdooOrderLine[]): Promise<void> {
    try {
      const rows = lines
        // display_type section/note lines carry no product — skip.
        .filter((l) => Array.isArray(l.product_id))
        .map((l) =>
          this.itemRepo.create({
            tenantId,
            orderId,
            productId: Array.isArray(l.product_id) ? String(l.product_id[0]) : null,
            title: (l.name ?? (Array.isArray(l.product_id) ? l.product_id[1] : '') ?? '').slice(0, 255) || 'Item',
            optionText: null,
            qty: l.product_uom_qty != null && l.product_uom_qty > 0 ? Math.round(l.product_uom_qty) : 1,
            price: typeof l.price_unit === 'number' ? l.price_unit : null,
          }),
        );
      await this.itemRepo.delete({ orderId });
      if (rows.length) await this.itemRepo.save(rows);
    } catch (e) {
      this.logger.warn(`Line items for Odoo order ${orderId} not cached: ${(e as Error).message}`);
    }
  }
}

/** A confirmed/cancelled Odoo state → our internal status. Quotations are filtered out upstream. */
function mapState(state: string | undefined): string {
  switch (state) {
    case 'sale':
    case 'done':
      return ORDER_STATUS_INTERNAL.PAID;
    case 'cancel':
      return ORDER_STATUS_INTERNAL.CANCEL_REQUESTED;
    default:
      return ORDER_STATUS_INTERNAL.PAID;
  }
}

function partnerId(o: OdooOrder): number | null {
  return Array.isArray(o.partner_id) ? Number(o.partner_id[0]) : null;
}

function groupLines(lines: OdooOrderLine[]): Map<number, OdooOrderLine[]> {
  const map = new Map<number, OdooOrderLine[]>();
  for (const l of lines) {
    const oid = Array.isArray(l.order_id) ? Number(l.order_id[0]) : null;
    if (oid == null) continue;
    const arr = map.get(oid) ?? [];
    arr.push(l);
    map.set(oid, arr);
  }
  return map;
}

/** Odoo `date_order` ("YYYY-MM-DD HH:mm:ss", UTC) → Date, or null. */
function parseOdooDate(raw: string | false | undefined): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  // Odoo returns naive UTC; make it explicit so it isn't read as local time.
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
