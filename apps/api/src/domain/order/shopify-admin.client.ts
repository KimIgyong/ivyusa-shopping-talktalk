import { Injectable } from '@nestjs/common';

const API_VERSION = '2026-01';
const FETCH_TIMEOUT_MS = 10_000;

/** Subset of a Shopify Admin API order we cache (REST-era field names kept). */
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
  /** Opaque cursor from a previous page; excludes other filters (they ride inside). */
  pageInfo?: string;
}

export interface FetchOrdersPage {
  orders: ShopifyOrderDto[];
  /** Cursor for the next page, or null when this was the last one. */
  nextPageInfo: string | null;
}

interface OrderNode {
  legacyResourceId?: string;
  name?: string;
  email?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  customer?: {
    legacyResourceId?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

interface OrdersQueryResponse {
  data?: {
    orders?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: OrderNode[];
    };
  };
  errors?: Array<{ message?: string }>;
}

const ORDERS_QUERY = `
query Orders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId
      name
      email
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { legacyResourceId email firstName lastName }
    }
  }
}`;

const WEBHOOK_CREATE_MUTATION = `
mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

/**
 * Thin Shopify Admin API client (read-only + webhook subscribe). Callers pass the
 * per-tenant token. GraphQL-only: new Dev Dashboard apps are not approved for REST
 * endpoints carrying protected customer data (orders return 403 over REST).
 */
@Injectable()
export class ShopifyAdminClient {
  /**
   * Fetch one page of orders. Incremental (`updatedAtMin`) + cursor-paginated.
   * GraphQL cursors are only valid alongside the query they were issued for, so
   * the returned `nextPageInfo` packs {after, query} — callers just round-trip it.
   */
  async fetchOrders(
    shopDomain: string,
    token: string,
    opts: FetchOrdersOptions = {},
  ): Promise<FetchOrdersPage> {
    const limit = opts.limit ?? 50;
    let after: string | null = null;
    let query: string | null = opts.updatedAtMin ? `updated_at:>='${opts.updatedAtMin}'` : null;
    if (opts.pageInfo) {
      const cursor = this.decodeCursor(opts.pageInfo);
      after = cursor.after;
      query = cursor.query;
    }

    const body = (await this.gql(shopDomain, token, ORDERS_QUERY, {
      first: limit,
      after,
      query,
    })) as OrdersQueryResponse;
    const conn = body.data?.orders;
    const orders = (conn?.nodes ?? []).map((n) => this.toOrderDto(n));
    const nextPageInfo =
      conn?.pageInfo?.hasNextPage && conn.pageInfo.endCursor
        ? this.encodeCursor(conn.pageInfo.endCursor, query)
        : null;
    return { orders, nextPageInfo };
  }

  /**
   * Create a webhook subscription (webhookSubscriptionCreate). Returns 'created',
   * 'exists' (already subscribed), or throws. Shopify signs deliveries with the
   * app's API secret key.
   */
  async createWebhook(
    shopDomain: string,
    token: string,
    topic: string,
    address: string,
  ): Promise<'created' | 'exists'> {
    const body = (await this.gql(shopDomain, token, WEBHOOK_CREATE_MUTATION, {
      topic: topic.replace(/[/.]/g, '_').toUpperCase(),
      sub: { callbackUrl: address, format: 'JSON' },
    })) as {
      data?: {
        webhookSubscriptionCreate?: {
          webhookSubscription?: { id?: string } | null;
          userErrors?: Array<{ message?: string }>;
        };
      };
    };
    const result = body.data?.webhookSubscriptionCreate;
    if (result?.webhookSubscription?.id) return 'created';
    const errors = result?.userErrors ?? [];
    if (errors.some((e) => /taken|exists|already/i.test(e.message ?? ''))) return 'exists';
    throw new Error(
      `webhookSubscriptionCreate failed: ${errors.map((e) => e.message).join('; ') || 'unknown error'}`,
    );
  }

  /** POST one GraphQL request; throws on HTTP or top-level GraphQL errors. */
  private async gql(
    shopDomain: string,
    token: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Admin API returned ${res.status}`);
      const body = (await res.json()) as { errors?: Array<{ message?: string }> };
      if (body.errors?.length) {
        throw new Error(`Admin API error: ${body.errors.map((e) => e.message).join('; ')}`);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  /** GraphQL node → REST-shaped DTO the sync/upsert layer already understands. */
  private toOrderDto(n: OrderNode): ShopifyOrderDto {
    return {
      id: Number(n.legacyResourceId ?? 0),
      name: n.name,
      email: n.email ?? null,
      financial_status: n.displayFinancialStatus?.toLowerCase() ?? null,
      fulfillment_status: this.mapFulfillmentStatus(n.displayFulfillmentStatus),
      total_price: n.totalPriceSet?.shopMoney?.amount ?? null,
      currency: n.totalPriceSet?.shopMoney?.currencyCode ?? null,
      customer: n.customer
        ? {
            id: n.customer.legacyResourceId ? Number(n.customer.legacyResourceId) : undefined,
            email: n.customer.email ?? null,
            first_name: n.customer.firstName ?? null,
            last_name: n.customer.lastName ?? null,
          }
        : null,
    };
  }

  /** GraphQL display status → REST rollup values used by the status mapper. */
  private mapFulfillmentStatus(display?: string | null): string | null {
    if (!display) return null;
    if (display === 'FULFILLED') return 'fulfilled';
    if (display === 'PARTIALLY_FULFILLED') return 'partial';
    return display.toLowerCase();
  }

  private encodeCursor(after: string, query: string | null): string {
    return Buffer.from(JSON.stringify({ after, query }), 'utf8').toString('base64url');
  }

  private decodeCursor(pageInfo: string): { after: string | null; query: string | null } {
    try {
      const parsed = JSON.parse(Buffer.from(pageInfo, 'base64url').toString('utf8')) as {
        after?: string;
        query?: string | null;
      };
      return { after: parsed.after ?? null, query: parsed.query ?? null };
    } catch {
      return { after: pageInfo, query: null };
    }
  }
}
