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

/** Thin Shopify Admin API client (read-only). Callers pass the per-tenant token. */
@Injectable()
export class ShopifyAdminClient {
  /** Fetch recent orders (status=any). Throws on non-2xx or network/timeout. */
  async fetchOrders(shopDomain: string, token: string, limit = 50): Promise<ShopifyOrderDto[]> {
    const url = `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?status=any&limit=${limit}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': token },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Admin API returned ${res.status}`);
      const data = (await res.json()) as { orders?: ShopifyOrderDto[] };
      return data.orders ?? [];
    } finally {
      clearTimeout(timer);
    }
  }
}
