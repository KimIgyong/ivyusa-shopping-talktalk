import { Injectable } from '@nestjs/common';
import { assertPublicUrl } from '../tenant/ecommerce-probe.util';

/** Credential shape stored for provider='woocommerce' (INTEGRATION_FIELDS.woocommerce). */
export interface WooConfig {
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
}

export interface WooProduct {
  id: number;
  name?: string;
  sku?: string;
  permalink?: string;
  price?: string;
  description?: string;
  short_description?: string;
  status?: string;
  date_created?: string;
  images?: Array<{ src?: string }>;
  categories?: Array<{ name?: string }>;
  tags?: Array<{ name?: string }>;
}

export interface WooOrder {
  id: number;
  number?: string;
  status?: string;
  total?: string;
  currency?: string;
  date_created?: string;
  customer_id?: number;
  billing?: { email?: string; first_name?: string; last_name?: string };
  line_items?: Array<{ name?: string; quantity?: number; total?: string; product_id?: number; sku?: string }>;
}

const TIMEOUT_MS = 15000;
const ASCII = /^[\x21-\x7e]+$/;

/**
 * WooCommerce REST v3 client — Basic auth (consumer key/secret) against a
 * tenant-supplied store URL, which is re-checked against the SSRF allowlist on
 * every run (defence in depth; save-time already checked it).
 */
@Injectable()
export class WooClient {
  private base(config: WooConfig): string {
    return String(config.store_url ?? '').trim().replace(/\/+$/, '');
  }

  private authHeader(config: WooConfig): string {
    const key = String(config.consumer_key ?? '').trim();
    const secret = String(config.consumer_secret ?? '').trim();
    if (!ASCII.test(key) || !ASCII.test(secret)) throw new Error('Consumer key/secret contain invalid characters');
    return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
  }

  private async get<T>(config: WooConfig, path: string): Promise<T> {
    const base = this.base(config);
    await assertPublicUrl(base); // SEC-M3: tenant-supplied store URL
    const auth = this.authHeader(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: auth, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('WooCommerce key/secret invalid');
        throw new Error(`WooCommerce returned ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Store currency (e.g. "USD"), or null when unreadable. */
  async storeCurrency(config: WooConfig): Promise<string | null> {
    try {
      const j = await this.get<{ settings?: { currency?: string } }>(config, '/wp-json/wc/v3/system_status');
      return j.settings?.currency ? String(j.settings.currency).slice(0, 8) : null;
    } catch {
      return null;
    }
  }

  async pullProducts(config: WooConfig, opts: { page: number; limit: number }): Promise<WooProduct[]> {
    const rows = await this.get<WooProduct[]>(
      config,
      `/wp-json/wc/v3/products?per_page=${opts.limit}&page=${opts.page}&orderby=id&order=asc`,
    );
    return Array.isArray(rows) ? rows : [];
  }

  async pullOrders(config: WooConfig, opts: { page: number; limit: number }): Promise<WooOrder[]> {
    const rows = await this.get<WooOrder[]>(
      config,
      `/wp-json/wc/v3/orders?per_page=${opts.limit}&page=${opts.page}&orderby=id&order=asc`,
    );
    return Array.isArray(rows) ? rows : [];
  }
}
