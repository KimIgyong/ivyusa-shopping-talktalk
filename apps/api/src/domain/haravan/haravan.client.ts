import { Injectable } from '@nestjs/common';

/** Credential shape stored for provider='haravan' (INTEGRATION_FIELDS.haravan). */
export interface HaravanConfig {
  shop_domain: string;
  access_token: string;
}

/** Haravan product (Shopify-compatible shape). */
export interface HaravanProduct {
  id: number;
  title?: string;
  handle?: string;
  vendor?: string;
  product_type?: string;
  body_html?: string;
  tags?: string;
  published_at?: string | null;
  images?: Array<{ src?: string }>;
  variants?: Array<{ price?: string | number; sku?: string }>;
}

/** Haravan order (Shopify-compatible shape). */
export interface HaravanOrder {
  id: number;
  name?: string;
  order_number?: string | number;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
  total_price?: string | number;
  currency?: string;
  created_at?: string;
  email?: string | null;
  contact_email?: string | null;
  customer?: { id?: number; email?: string | null; first_name?: string; last_name?: string } | null;
  line_items?: Array<{
    title?: string;
    variant_title?: string | null;
    quantity?: number;
    price?: string | number;
    product_id?: number | null;
    sku?: string | null;
  }>;
}

const TIMEOUT_MS = 15000;
/** Header-bound secrets must be printable ASCII, else fetch throws a ByteString error. */
const ASCII = /^[\x21-\x7e]+$/;

/**
 * Haravan Admin API client — Shopify-compatible REST, Bearer token, pinned to
 * the tenant's `*.myharavan.com` shop domain (so no SSRF allowlist is needed,
 * unlike the free-form Woo/Odoo URLs).
 */
@Injectable()
export class HaravanClient {
  private host(config: HaravanConfig): string {
    return String(config.shop_domain ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  private async get<T>(config: HaravanConfig, path: string): Promise<T> {
    const token = String(config.access_token ?? '').trim();
    if (!ASCII.test(token)) throw new Error('Access token contains invalid characters');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://${this.host(config)}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Haravan token invalid or expired');
        throw new Error(`Haravan returned ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Store currency (e.g. "VND"), or null when unreadable. */
  async shopCurrency(config: HaravanConfig): Promise<string | null> {
    try {
      const j = await this.get<{ shop?: { currency?: string } }>(config, '/admin/shop.json');
      return j.shop?.currency ? String(j.shop.currency).slice(0, 8) : null;
    } catch {
      return null;
    }
  }

  async pullProducts(config: HaravanConfig, opts: { page: number; limit: number }): Promise<HaravanProduct[]> {
    const j = await this.get<{ products?: HaravanProduct[] }>(
      config,
      `/admin/products.json?limit=${opts.limit}&page=${opts.page}`,
    );
    return Array.isArray(j.products) ? j.products : [];
  }

  async pullOrders(config: HaravanConfig, opts: { page: number; limit: number }): Promise<HaravanOrder[]> {
    const j = await this.get<{ orders?: HaravanOrder[] }>(
      config,
      `/admin/orders.json?limit=${opts.limit}&page=${opts.page}&status=any`,
    );
    return Array.isArray(j.orders) ? j.orders : [];
  }
}
