import { Injectable, Logger } from '@nestjs/common';

const API_VERSION = '2026-01';
const FETCH_TIMEOUT_MS = 10_000;
/**
 * Line items fetched per order. Kept modest so a page of orders stays inside the
 * Admin API query-cost budget; carts longer than this are truncated (the cached
 * item list is for customer self-service, not accounting).
 */
const LINE_ITEMS_PER_ORDER = 50;

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
  /**
   * Line items, REST-shaped. Order webhooks deliver this natively (including
   * product/variant ids and option text); the GraphQL sync fills the subset
   * `read_orders` allows. `undefined` means "this payload carries no item info"
   * and leaves cached items untouched; `[]` means the order genuinely has none.
   */
  line_items?: Array<{
    id?: number | string;
    product_id?: number | string | null;
    variant_id?: number | string | null;
    title?: string | null;
    name?: string | null;
    variant_title?: string | null;
    quantity?: number | null;
    price?: string | number | null;
  }> | null;
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
  lineItems?: {
    nodes?: Array<{
      title?: string | null;
      quantity?: number | null;
      originalUnitPriceSet?: { shopMoney?: { amount?: string } } | null;
    }>;
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

/**
 * `lineItems` selection, kept to fields readable with `read_orders` alone. The
 * richer ones (`variant`, `product`, `sku`) require **read_products**, which this
 * app does not request — asking for them fails the whole query, so we don't.
 * Add them here only together with the scope.
 */
const LINE_ITEMS_SELECTION = `
      lineItems(first: ${LINE_ITEMS_PER_ORDER}) {
        nodes {
          title
          quantity
          originalUnitPriceSet { shopMoney { amount } }
        }
      }`;

/** Orders page query; `withLineItems` toggles the optional enrichment above. */
function ordersQuery(withLineItems: boolean): string {
  return `
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
      customer { legacyResourceId email firstName lastName }${
        withLineItems ? LINE_ITEMS_SELECTION : ''
      }
    }
  }
}`;
}

const WEBHOOK_CREATE_MUTATION = `
mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

const CUSTOMER_QUERY = `
query Customer($id: ID!) {
  customer(id: $id) {
    legacyResourceId
    email
    firstName
    lastName
  }
}`;

/**
 * Thin Shopify Admin API client (read-only + webhook subscribe). Callers pass the
 * per-tenant token. GraphQL-only: new Dev Dashboard apps are not approved for REST
 * endpoints carrying protected customer data (orders return 403 over REST).
 */
@Injectable()
export class ShopifyAdminClient {
  private readonly logger = new Logger(ShopifyAdminClient.name);

  /** Access/scope denial on a field — the caller can retry a narrower selection. */
  private isAccessScopeError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return /access denied|access scope/i.test(msg);
  }

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

    const vars = { first: limit, after, query };
    let body: OrdersQueryResponse;
    try {
      body = (await this.gql(shopDomain, token, ordersQuery(true), vars)) as OrdersQueryResponse;
    } catch (e) {
      // Line items are optional enrichment — never let a scope/access error on
      // them stall order sync. Retry once without that selection.
      if (!this.isAccessScopeError(e)) throw e;
      this.logger.warn(
        `Line items unavailable for ${shopDomain} (${(e as Error).message}) — syncing orders without them`,
      );
      body = (await this.gql(shopDomain, token, ordersQuery(false), vars)) as OrdersQueryResponse;
    }
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

  /**
   * Fetch a single customer's contact profile by Shopify (legacy numeric) id.
   * Used to backfill name/email onto a row the app-proxy identity path created
   * with nulls. Requires read_customers + Protected Customer Data approval —
   * until approved this 403s; callers treat any throw as "no profile available".
   */
  async fetchCustomer(
    shopDomain: string,
    token: string,
    shopifyCustomerId: string,
  ): Promise<{ email: string | null; firstName: string | null; lastName: string | null } | null> {
    const body = (await this.gql(shopDomain, token, CUSTOMER_QUERY, {
      id: `gid://shopify/Customer/${shopifyCustomerId}`,
    })) as {
      data?: {
        customer?: {
          email?: string | null;
          firstName?: string | null;
          lastName?: string | null;
        } | null;
      };
    };
    const c = body.data?.customer;
    if (!c) return null;
    return {
      email: c.email ?? null,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
    };
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
      // Absent connection (fallback query) → undefined, so the upsert leaves any
      // cached items alone rather than wiping them. Present → map it.
      line_items: n.lineItems
        ? (n.lineItems.nodes ?? []).map((li) => ({
            title: li.title ?? null,
            quantity: li.quantity ?? null,
            price: li.originalUnitPriceSet?.shopMoney?.amount ?? null,
          }))
        : undefined,
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
