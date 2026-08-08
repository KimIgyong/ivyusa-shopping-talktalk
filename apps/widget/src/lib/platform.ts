/**
 * Storefront-platform helpers. The embed loader passes the storefront host as the
 * `shop` query param on the widget iframe URL, so the widget can offer platform-
 * native affordances (e.g. the mall's own order-history page) without extra config.
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
 * The storefront's native "my page" order-history URL, or null when the host is
 * unknown. The mall authenticates the member itself, so the link works regardless
 * of the widget's session state. Cafe24 malls use /myshop/order/list.html; other
 * storefronts (Shopify) use /account, which lists the customer's orders.
 */
export function myPageOrdersUrl(): string | null {
  const host = shopHost();
  if (!host) return null;
  return /(^|\.)cafe24\.com$/.test(host)
    ? `https://${host}/myshop/order/list.html`
    : `https://${host}/account`;
}
