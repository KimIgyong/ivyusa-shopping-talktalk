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
  cancelled: 'cancelled',
  canceled: 'cancelled',
  refunded: 'refunded',
};

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
 * Whether the order is on its way — the only rows that show tracking steps.
 *
 * Reads both fields because a mall that never sets `status_internal` still
 * deserves a progress bar, and because this must NOT decide visibility: an order
 * that is not in transit still appears in the list, just without steps. That is
 * the bug this whole change exists to undo (REQ-260818-Widget-Orders-Tab C-3).
 */
export function isOrderInTransit(order: {
  statusInternal?: string | null;
  statusUi?: string | null;
}): boolean {
  return /ship|transit|fulfil/i.test(`${order.statusInternal ?? ''} ${order.statusUi ?? ''}`);
}
