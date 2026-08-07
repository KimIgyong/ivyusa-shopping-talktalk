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
export interface Cafe24Product {
  product_no?: number;
  product_code?: string;
  product_name?: string;
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
   * Resolve a storefront member (member_id, from an order) to their front
   * `user_identifier` + contact profile via the Admin API (PLN-260808 P-A2, J1).
   * The admin customers resource filters only by member_id/cellphone and returns the
   * same client-scoped `user_identifier` the customer-auth flow produces — so order
   * sync can stamp it onto the customer, letting a later sign-in match. Returns null
   * (never throws to the caller's happy path) when unmatched. Requires mall.read_customer.
   */
  async fetchCustomerByMemberId(
    mallId: string,
    accessToken: string,
    memberId: string,
  ): Promise<{ userIdentifier: string | null; email: string | null; name: string | null } | null> {
    const qs = new URLSearchParams({ member_id: memberId, limit: '1' });
    const body = await this.request<{ customers?: Array<Record<string, unknown>> }>(
      mallId,
      accessToken,
      'GET',
      `/customers?${qs.toString()}`,
    );
    const c = body.customers?.[0];
    if (!c) return null;
    return {
      userIdentifier: typeof c.user_identifier === 'string' ? c.user_identifier : null,
      email: typeof c.email === 'string' ? c.email : null,
      name: typeof c.name === 'string' ? c.name : null,
    };
  }

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
