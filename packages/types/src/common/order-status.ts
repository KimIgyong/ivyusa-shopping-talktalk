/**
 * Order-status presentation rules, shared so they can be tested.
 *
 * The widget has no test runner, and these two functions are exactly the part
 * worth pinning: one decides whether a shopper sees a translated status or a raw
 * platform string, the other decides whether a row shows shipping progress.
 * Neither touches i18n or the DOM, so they live here and the widget applies
 * `t()` to the key this returns.
 */

/**
 * Statuses this app can name in the shopper's language, keyed off
 * `status_internal` — the value WE write.
 *
 * `status_ui` is deliberately not mapped: it holds whatever the platform called
 * it ("In Transit" on Shopify, something else on Cafe24, and a mall can rename
 * either), so translating it would be a guess that breaks per shop.
 */
const STATUS_KEYS: Record<string, string> = {
  pending_payment: 'pendingPayment',
  paid: 'paid',
  confirmed: 'paid',
  preparing: 'preparing',
  processing: 'preparing',
  ready: 'preparing',
  shipping: 'shipping',
  shipped: 'shipping',
  in_transit: 'shipping',
  delivered: 'delivered',
  completed: 'delivered',
  cancel_requested: 'cancelRequested',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  refunded: 'refunded',
};

/** The only statuses that mean "moving". An allowlist, for the reason below. */
const IN_TRANSIT_KEYS = new Set(['shipping']);

/** …and the ones that mean it already arrived. */
const DELIVERED_KEYS = new Set(['delivered']);

/**
 * Platform wording that means in transit, used ONLY when we have no internal
 * status. Anchored, never a substring search.
 */
const IN_TRANSIT_UI = /^(in[\s_-]?transit|shipped|shipping|out for delivery|fulfilled)$/i;

/** i18n sub-key under `orders.status`, or null when we have no name for it. */
export function orderStatusKey(statusInternal?: string | null): string | null {
  return STATUS_KEYS[(statusInternal ?? '').toLowerCase().trim()] ?? null;
}

/**
 * The label to render, given a translator for the known keys.
 *
 * Falls through to the platform's own wording, then to the internal code, then
 * to null. The fallback chain is the point: an unmapped status must still render
 * SOMETHING. An empty badge reads as "this order has no status", which is worse
 * than showing a Korean shopper an English word — and mall-specific statuses are
 * guaranteed to turn up.
 */
export function orderStatusLabel(
  order: { statusInternal?: string | null; statusUi?: string | null },
  translate: (key: string) => string,
): string | null {
  const key = orderStatusKey(order.statusInternal);
  if (key) return translate(key);
  return order.statusUi?.trim() || order.statusInternal?.trim() || null;
}

/**
 * Whether the order is on its way — the only rows that draw tracking steps.
 *
 * An allowlist, not a substring match. `/ship|transit|fulfil/` looked equivalent
 * and was not: it matches **`Unfulfilled`**, which is Shopify's word for an order
 * that has NOT shipped, so the least-shipped orders would have drawn a progress
 * bar and fired a tracking request each.
 *
 * `statusInternal` wins whenever we have it, because the two fields genuinely
 * disagree in production — staging holds rows with `preparing` / "In Transit" —
 * and the value we write is the one we can reason about. `statusUi` is consulted
 * only when the internal status is missing, and then only as a whole string.
 *
 * This must NOT decide visibility: an order that is not in transit still appears
 * in the list, just without steps. Filtering on it is the bug this change undoes
 * (REQ-260818-Widget-Orders-Tab C-3).
 */
export function isOrderInTransit(order: {
  statusInternal?: string | null;
  statusUi?: string | null;
}): boolean {
  const internal = (order.statusInternal ?? '').toLowerCase().trim();
  if (internal) {
    const key = STATUS_KEYS[internal];
    // An unmapped internal status is not assumed to be moving — guessing here
    // is what put a progress bar on `Unfulfilled`.
    return key ? IN_TRANSIT_KEYS.has(key) : false;
  }
  return IN_TRANSIT_UI.test((order.statusUi ?? '').trim());
}

/** Anchored platform wording for "arrived", used only without an internal status. */
const DELIVERED_UI = /^(delivered|complete[d]?)$/i;

/**
 * Whether the order has arrived. Same allowlist discipline as
 * `isOrderInTransit`, and for the same reason: `/deliver|complete/` as a
 * substring would read "delivery failed" or "incomplete" as success.
 */
export function isOrderDelivered(order: {
  statusInternal?: string | null;
  statusUi?: string | null;
}): boolean {
  const internal = (order.statusInternal ?? '').toLowerCase().trim();
  if (internal) {
    const key = STATUS_KEYS[internal];
    return key ? DELIVERED_KEYS.has(key) : false;
  }
  return DELIVERED_UI.test((order.statusUi ?? '').trim());
}
