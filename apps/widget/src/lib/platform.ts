/**
 * Storefront-platform helpers. The embed loader passes the storefront host as the
 * `shop` query param on the widget iframe URL, so the widget can offer platform-
 * native affordances (e.g. Cafe24's own order-list page) without extra config.
 */

/** The current storefront host, from the iframe's `shop` param. */
function shopHost(): string {
  try {
    return (new URLSearchParams(window.location.search).get('shop') || '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The Cafe24 mall's native "my orders" page for this storefront, or null when the
 * shop isn't a Cafe24 mall. Linked as a "view all" fallback: the mall authenticates
 * the member itself, so it works regardless of the widget's session state.
 */
export function cafe24OrderListUrl(): string | null {
  const host = shopHost();
  return /(^|\.)cafe24\.com$/.test(host) ? `https://${host}/myshop/order/list.html` : null;
}
