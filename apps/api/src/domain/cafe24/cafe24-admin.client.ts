import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ORDER_STATUS_INTERNAL, OrderStatusInternal } from '@ivy/types';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Cafe24 Admin REST client (P-A1). Ports the platform behaviour proven in
 * btbz-shop-pmm's `cafe24.real.adapter.ts` — host split, Bearer auth, version
 * header, and leaky-bucket rate-limit handling — onto ShopTalk's stack. Read-only
 * for the support use case (orders + catalog); no order/product writes here.
 */

const API_VERSION_DEFAULT = process.env.CAFE24_API_VERSION ?? '2025-09-01';
const BUCKET_SLOWDOWN_AT = 35; // of 40 — back off before Cafe24 throttles us.
const RETRY_WAIT_CAP_MS = 10_000;

/** authorize/consent host — `{mall}.cafe24.com`; API/token host — `{mall}.cafe24api.com`. */
export function cafe24AuthHost(mallId: string): string {
  const t = process.env.CAFE24_AUTH_HOST_TEMPLATE ?? 'https://{mallId}.cafe24.com';
  return t.replace('{mallId}', mallId);
}
export function cafe24ApiHost(mallId: string): string {
  const t = process.env.CAFE24_API_HOST_TEMPLATE ?? 'https://{mallId}.cafe24api.com';
  return t.replace('{mallId}', mallId);
}

/** Cafe24 order-item status code → ShopTalk internal status (PLN-260807 §3.3). */
const CAFE24_STATUS_TO_INTERNAL: Record<string, OrderStatusInternal> = {
  N00: ORDER_STATUS_INTERNAL.PENDING_PAYMENT,
  N10: ORDER_STATUS_INTERNAL.PREPARING,
  N20: ORDER_STATUS_INTERNAL.PREPARING,
  N21: ORDER_STATUS_INTERNAL.PREPARING,
  N22: ORDER_STATUS_INTERNAL.PREPARING,
  N30: ORDER_STATUS_INTERNAL.SHIPPING,
  N40: ORDER_STATUS_INTERNAL.DELIVERED,
  C00: ORDER_STATUS_INTERNAL.CANCEL_REQUESTED,
};
// Progress rank so a mixed-item order reports its LEAST-advanced stage rather than
// over-claiming "delivered". Cancel sits outside the linear flow.
const STATUS_RANK: Record<OrderStatusInternal, number> = {
  [ORDER_STATUS_INTERNAL.CANCEL_REQUESTED]: 0,
  [ORDER_STATUS_INTERNAL.PENDING_PAYMENT]: 1,
  [ORDER_STATUS_INTERNAL.PAID]: 2,
  [ORDER_STATUS_INTERNAL.PREPARING]: 3,
  [ORDER_STATUS_INTERNAL.SHIPPING]: 4,
  [ORDER_STATUS_INTERNAL.DELIVERED]: 5,
};

export interface Cafe24OrderItem {
  order_item_code?: string;
  product_no?: number;
  variant_code?: string;
  custom_variant_code?: string;
  product_name?: string;
  quantity?: number;
  product_price?: string;
  order_status?: string; // N00/N10/…/C00
  status_text?: string;
}
export interface Cafe24Order {
  order_id: string;
  order_date?: string;
  currency?: string;
  paid?: string; // 'T' | 'F'
  payment_amount?: string;
  actual_order_amount?: { total_amount_due?: string };
  member_id?: string | null; // storefront login id — the key to the member's user_identifier
  member_email?: string | null;
  billing_name?: string | null;
  items?: Cafe24OrderItem[];
}
export interface Cafe24Variant {
  variant_code?: string;
  custom_variant_code?: string;
}

/**
 * A catalogue row as the Admin API serves it.
 *
 * Every field beyond `product_no` is optional on purpose. Which of them the LIST
 * response carries is not settled by the documentation — `description` in
 * particular is served on the single-product resource and may be absent from the
 * list — and a mapper that assumes a field is present writes empty documents in
 * silence. The sync fills gaps by fetching the detail resource instead
 * (PLN-260808-Cafe24-Product-Knowledge P1; kit-01 §3.6 — never fix an external
 * schema from documentation alone).
 */
export interface Cafe24Product {
  product_no?: number;
  product_code?: string;
  product_name?: string;
  /** Full detail HTML (상세설명). */
  description?: string | null;
  /** Short marketing line (상품 요약설명). */
  summary_description?: string | null;
  /** One-liner shown in list views (상품 간략설명). */
  simple_description?: string | null;
  price?: string | number | null;
  /** 'T' = on display, 'F' = hidden. */
  display?: string;
  /** 'T' = for sale, 'F' = not sold. */
  selling?: string;
  /** 'T' when the product has options — the only case worth an options call. */
  has_option?: string;
  brand_code?: string | null;
  product_tag?: string[] | string | null;
  /** Category memberships; `category_no` resolves to a name via /categories. */
  category?: Array<{ category_no?: number }> | null;
  detail_image?: string | null;
  list_image?: string | null;
  created_date?: string | null;
}

/** One option row of `GET /products/{no}/options` (name + selectable values). */
export interface Cafe24ProductOption {
  option_name?: string;
  option_value?: Array<{ option_text?: string }> | null;
}

/** A storefront category (code → display name). */
export interface Cafe24Category {
  category_no?: number;
  category_name?: string;
}

@Injectable()
export class Cafe24AdminClient {
  private readonly logger = new Logger(Cafe24AdminClient.name);

  /** Map a Cafe24 order → an internal header status (least-advanced of its items). */
  deriveInternalStatus(items: Cafe24OrderItem[] | undefined): OrderStatusInternal {
    const mapped = (items ?? [])
      .map((i) => CAFE24_STATUS_TO_INTERNAL[(i.order_status ?? '').toUpperCase()])
      .filter((s): s is OrderStatusInternal => Boolean(s));
    if (mapped.length === 0) return ORDER_STATUS_INTERNAL.PREPARING;
    return mapped.reduce((a, b) => (STATUS_RANK[b] < STATUS_RANK[a] ? b : a));
  }

  /** Total amount — Cafe24 keeps the live figure in different fields by payment state. */
  orderTotal(o: Cafe24Order): number | null {
    const raw =
      o.paid === 'F' ? o.actual_order_amount?.total_amount_due : o.payment_amount;
    const v = raw ?? o.payment_amount ?? o.actual_order_amount?.total_amount_due;
    return v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  }

  private async request<T>(
    mallId: string,
    accessToken: string,
    method: string,
    path: string,
    retried = false,
  ): Promise<T> {
    const url = `${cafe24ApiHost(mallId)}/api/v2/admin${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': API_VERSION_DEFAULT,
      },
    });
    // Leaky bucket: slow down before we hit the ceiling.
    const bucket = res.headers.get('X-Api-Call-Limit'); // "n/40"
    const used = bucket ? Number(bucket.split('/')[0]) : 0;
    if (used >= BUCKET_SLOWDOWN_AT) await sleep(600);
    if (res.status === 429 && !retried) {
      const remain = Number(res.headers.get('X-Cafe24-Call-Remain') ?? '1');
      await sleep(Math.min(Math.max(remain, 1) * 1000, RETRY_WAIT_CAP_MS));
      return this.request<T>(mallId, accessToken, method, path, true);
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300); // truncate — never leak tokens
      this.logger.warn(`cafe24 ${method} ${path} -> ${res.status} ${body}`);
      throw new BusinessException(ERROR_CODE.CAFE24_API_ERROR, HttpStatus.BAD_GATEWAY);
    }
    return (await res.json()) as T;
  }

  /** Pull orders in a date window (embed=items → one call, N+1 avoided). */
  async pullOrders(
    mallId: string,
    accessToken: string,
    opts: { startDate: string; endDate: string; limit?: number; offset?: number },
  ): Promise<Cafe24Order[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const qs = new URLSearchParams({
      start_date: opts.startDate,
      end_date: opts.endDate,
      limit: String(limit),
      offset: String(offset),
      embed: 'items',
    });
    const body = await this.request<{ orders?: Cafe24Order[] }>(
      mallId,
      accessToken,
      'GET',
      `/orders?${qs.toString()}`,
    );
    return body.orders ?? [];
  }

  /**
   * One page of the catalogue.
   *
   * Cafe24 refuses an `offset` above 8,000, so a mall deeper than that is paged
   * by `since_product_no` instead — the caller switches once it crosses the cap
   * (the behaviour proven in btbz-shop-pmm's adapter).
   */
  async pullProducts(
    mallId: string,
    accessToken: string,
    opts: { limit?: number; offset?: number; sinceProductNo?: number | null },
  ): Promise<Cafe24Product[]> {
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 100) });
    if (opts.sinceProductNo != null) qs.set('since_product_no', String(opts.sinceProductNo));
    else qs.set('offset', String(opts.offset ?? 0));
    const body = await this.request<{ products?: Cafe24Product[] }>(
      mallId,
      accessToken,
      'GET',
      `/products?${qs.toString()}`,
    );
    return body.products ?? [];
  }

  /** The single-product resource — the authority on the fields a list row omits. */
  async fetchProduct(
    mallId: string,
    accessToken: string,
    productNo: number,
  ): Promise<Cafe24Product | null> {
    const body = await this.request<{ product?: Cafe24Product }>(
      mallId,
      accessToken,
      'GET',
      `/products/${productNo}`,
    );
    return body.product ?? null;
  }

  /** Option names and their selectable values, for the product knowledge body. */
  async fetchProductOptions(
    mallId: string,
    accessToken: string,
    productNo: number,
  ): Promise<Cafe24ProductOption[]> {
    const body = await this.request<{ options?: Cafe24ProductOption[]; option?: { options?: Cafe24ProductOption[] } }>(
      mallId,
      accessToken,
      'GET',
      `/products/${productNo}/options`,
    );
    // The resource is documented as a single `option` object, but has also been
    // observed as a plain `options` array. Accept either rather than lose the values.
    return body.options ?? body.option?.options ?? [];
  }

  /**
   * category_no → display name.
   *
   * Categories sit behind their own scope (`mall.read_category`), which this app
   * does not request. A 403 therefore is not a failure — the catalogue sync
   * simply leaves the category blank rather than storing a number no human can
   * read. Returns an empty map on any error.
   */
  async listCategoryNames(mallId: string, accessToken: string): Promise<Map<number, string>> {
    const names = new Map<number, string>();
    try {
      for (let offset = 0; offset < 1000; offset += 100) {
        const body = await this.request<{ categories?: Cafe24Category[] }>(
          mallId,
          accessToken,
          'GET',
          `/categories?limit=100&offset=${offset}`,
        );
        const page = body.categories ?? [];
        const before = names.size;
        for (const c of page) {
          if (c.category_no != null && c.category_name) names.set(Number(c.category_no), c.category_name);
        }
        // Rows came back but none of them mapped: the response carries different
        // field names than assumed. Left quiet this would look exactly like "the
        // mall has no categories" — a blank category on every product with
        // nothing in the log to explain it.
        if (page.length > 0 && names.size === before) {
          this.logger.warn(
            `cafe24 categories: ${page.length} row(s) but no category_no/category_name — ` +
              `unexpected shape, keys=[${Object.keys(page[0] ?? {}).join(',')}]`,
          );
        }
        if (page.length < 100) break;
      }
    } catch (e) {
      this.logger.warn(`cafe24 categories unavailable (names omitted): ${(e as Error).message}`);
    }
    return names;
  }

  // (fetchCustomerByMemberId / /customersprivacy removed — the customer token
  // response carries the member's `user_id` directly, so member↔order matching no
  // longer needs mall.read_personal. PLN-260808-Cafe24-MemberId-RecentOrders.)

  /** Connectivity probe — the store resource (cheap, no PII). */
  async getStore(mallId: string, accessToken: string): Promise<{ shop_name?: string } | null> {
    const body = await this.request<{ store?: { shop_name?: string } }>(
      mallId,
      accessToken,
      'GET',
      '/store',
    );
    return body.store ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
