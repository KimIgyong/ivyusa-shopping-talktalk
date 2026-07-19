import { Injectable } from '@nestjs/common';

const API_VERSION = '2024-10';
const FETCH_TIMEOUT_MS = 10_000;

/** Subset of a Shopify Admin API order we cache. */
export interface ShopifyOrderDto {
  id: number;
  order_number?: number;
  name?: string;
  email?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string | null;
  currency?: string | null;
  customer?: {
    id?: number;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

/** Subset of a Shopify fulfillment webhook payload we act on. */
export interface ShopifyFulfillmentDto {
  order_id?: number;
  status?: string | null;
  shipment_status?: string | null;
  tracking_number?: string | null;
  tracking_company?: string | null;
}

export interface FetchOrdersOptions {
  limit?: number;
  /** Incremental cursor — only orders updated at/after this instant (PERF-5). */
  updatedAtMin?: string;
  /** Opaque cursor from a previous page's Link header; excludes other filters. */
  pageInfo?: string;
}

export interface FetchOrdersPage {
  orders: ShopifyOrderDto[];
  /** page_info for the next page, or null when this was the last one. */
  nextPageInfo: string | null;
}

/** Thin Shopify Admin API client (read-only). Callers pass the per-tenant token. */
@Injectable()
export class ShopifyAdminClient {
  /**
   * Fetch one page of orders. Incremental (`updatedAtMin`) + cursor-paginated
   * (`pageInfo` from the RFC-5988 Link header) so stores with >50 orders sync
   * fully and repeat runs only pull what changed (PERF-5). Note: when pageInfo
   * is present Shopify forbids other filter params — the original filters ride
   * inside the cursor.
   */
  async fetchOrders(
    shopDomain: string,
    token: string,
    opts: FetchOrdersOptions = {},
  ): Promise<FetchOrdersPage> {
    const limit = opts.limit ?? 50;
    const params = new URLSearchParams({ limit: String(limit) });
    if (opts.pageInfo) {
      params.set('page_info', opts.pageInfo);
    } else {
      params.set('status', 'any');
      if (opts.updatedAtMin) params.set('updated_at_min', opts.updatedAtMin);
    }
    const url = `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': token },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Admin API returned ${res.status}`);
      const data = (await res.json()) as { orders?: ShopifyOrderDto[] };
      return {
        orders: data.orders ?? [],
        nextPageInfo: this.parseNextPageInfo(res.headers.get('link')),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Extract page_info from `<...page_info=XYZ...>; rel="next"` in a Link header. */
  private parseNextPageInfo(link: string | null): string | null {
    if (!link) return null;
    for (const part of link.split(',')) {
      if (!/rel="next"/.test(part)) continue;
      const m = part.match(/[?&]page_info=([^&>]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }

  /**
   * Create a webhook subscription. Returns 'created', 'exists' (422 duplicate), or
   * throws on other failures. Shopify signs these with the app's API secret key.
   */
  async createWebhook(
    shopDomain: string,
    token: string,
    topic: string,
    address: string,
  ): Promise<'created' | 'exists'> {
    const url = `https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
        signal: controller.signal,
      });
      if (res.status === 201) return 'created';
      if (res.status === 422) return 'exists'; // already subscribed to this topic+address
      throw new Error(`Admin API returned ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
