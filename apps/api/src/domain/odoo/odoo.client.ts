import { Injectable, Logger } from '@nestjs/common';
import { assertPublicUrl } from '../tenant/ecommerce-probe.util';

/** Credential shape stored for provider='odoo' (INTEGRATION_FIELDS.odoo). */
export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  api_key: string;
}

/** A product.template row as read over the external API (W0-confirmed fields). */
export interface OdooProduct {
  id: number;
  name?: string;
  list_price?: number;
  default_code?: string | false;
  /** `[id, "Full / Category / Path"]` or false. */
  categ_id?: [number, string] | false;
  /** website_sale pretty path, e.g. `/shop/slug-544`, or false when eCommerce is off. */
  website_url?: string | false;
  description_sale?: string | false;
}

/** A sale.order row (W0-confirmed fields). */
export interface OdooOrder {
  id: number;
  name?: string;
  state?: string;
  amount_total?: number;
  currency_id?: [number, string] | false;
  date_order?: string | false;
  partner_id?: [number, string] | false;
}

/** A sale.order.line row (order_id links it back to its order). */
export interface OdooOrderLine {
  id: number;
  order_id?: [number, string] | false;
  product_id?: [number, string] | false;
  name?: string;
  product_uom_qty?: number;
  price_unit?: number;
}

/** A res.partner row read for the buyer of an order. */
export interface OdooPartner {
  id: number;
  name?: string;
  email?: string | false;
}

const TIMEOUT_MS = 15000;

/**
 * Minimal Odoo external-API client (JSON-RPC at `{url}/jsonrpc`).
 *
 * Auth is a two-hop dance: `common.authenticate(db, user, api_key)` returns a
 * numeric uid, then every model call goes through `object.execute_kw(db, uid,
 * api_key, model, method, args, kwargs)`. The API key replaces the password —
 * we never hold a session. The tenant-supplied `url` is re-checked against the
 * SSRF allowlist on every run (defence in depth; save-time already checked it).
 */
@Injectable()
export class OdooClient {
  private readonly logger = new Logger(OdooClient.name);

  private base(config: OdooConfig): string {
    return String(config.url ?? '').trim().replace(/\/+$/, '');
  }

  private async rpc(base: string, service: string, method: string, args: unknown[]): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Odoo returned ${res.status}`);
      const data = (await res.json()) as {
        result?: unknown;
        error?: { data?: { message?: string } };
      };
      if (data.error) throw new Error(data.error.data?.message ?? 'Odoo RPC error');
      return data.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Resolve a uid; throws on invalid credentials. */
  async authenticate(config: OdooConfig): Promise<number> {
    const base = this.base(config);
    await assertPublicUrl(base); // SEC-M3: tenant-supplied URL
    const uid = await this.rpc(base, 'common', 'authenticate', [
      config.db,
      config.username,
      config.api_key,
      {},
    ]);
    if (typeof uid !== 'number' || uid <= 0) {
      throw new Error('Odoo authentication failed — check db / user / API key');
    }
    return uid;
  }

  private execKw(
    config: OdooConfig,
    uid: number,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.rpc(this.base(config), 'object', 'execute_kw', [
      config.db,
      uid,
      config.api_key,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  /** Company currency code (e.g. "VND"), or null when it can't be read. */
  async companyCurrency(config: OdooConfig, uid: number): Promise<string | null> {
    try {
      const rows = (await this.execKw(config, uid, 'res.company', 'search_read', [[], ['currency_id']], {
        limit: 1,
      })) as Array<{ currency_id?: [number, string] | false }>;
      const cur = rows[0]?.currency_id;
      return Array.isArray(cur) ? String(cur[1]).slice(0, 8) : null;
    } catch (e) {
      this.logger.warn(`Odoo companyCurrency read failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * One page of sellable, active products (product.template). We never request
   * image bytes (`image_1920`) — those are base64 and would bloat the response;
   * the image URL is built from the id instead.
   */
  async pullProducts(
    config: OdooConfig,
    uid: number,
    opts: { offset: number; limit: number },
  ): Promise<OdooProduct[]> {
    const domain = [
      ['sale_ok', '=', true],
      ['active', '=', true],
    ];
    const fields = ['id', 'name', 'list_price', 'default_code', 'categ_id', 'website_url', 'description_sale'];
    const rows = (await this.execKw(config, uid, 'product.template', 'search_read', [domain, fields], {
      offset: opts.offset,
      limit: opts.limit,
      order: 'id asc',
    })) as OdooProduct[];
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * One page of real orders — confirmed (`sale`/`done`) and cancelled, but never
   * quotations (`draft`/`sent`), which are not orders a shopper placed.
   */
  async pullOrders(
    config: OdooConfig,
    uid: number,
    opts: { offset: number; limit: number },
  ): Promise<OdooOrder[]> {
    const domain = [['state', 'in', ['sale', 'done', 'cancel']]];
    const fields = ['id', 'name', 'state', 'amount_total', 'currency_id', 'date_order', 'partner_id'];
    const rows = (await this.execKw(config, uid, 'sale.order', 'search_read', [domain, fields], {
      offset: opts.offset,
      limit: opts.limit,
      order: 'id asc',
    })) as OdooOrder[];
    return Array.isArray(rows) ? rows : [];
  }

  /** All line items for the given order ids, in one call. */
  async pullOrderLines(config: OdooConfig, uid: number, orderIds: number[]): Promise<OdooOrderLine[]> {
    if (orderIds.length === 0) return [];
    const domain = [['order_id', 'in', orderIds]];
    const fields = ['id', 'order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit'];
    const rows = (await this.execKw(config, uid, 'sale.order.line', 'search_read', [domain, fields], {
      // display_type lines (sections/notes) have no product — skip them downstream.
      limit: 5000,
    })) as OdooOrderLine[];
    return Array.isArray(rows) ? rows : [];
  }

  /** Buyer records for the given partner ids, in one call (id → {name, email}). */
  async pullPartners(config: OdooConfig, uid: number, partnerIds: number[]): Promise<OdooPartner[]> {
    if (partnerIds.length === 0) return [];
    const rows = (await this.execKw(config, uid, 'res.partner', 'read', [
      partnerIds,
      ['id', 'name', 'email'],
    ])) as OdooPartner[];
    return Array.isArray(rows) ? rows : [];
  }
}
