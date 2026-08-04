/**
 * Canonical form of an order number: no leading '#', no surrounding whitespace.
 *
 * Both sides of the comparison have to agree, and they did not. Ingest stored the
 * bare number (`1002`) while guest lookup compared the shopper's raw input, so a
 * shopper who typed the number exactly as the widget renders it — `#1002`, the same
 * way Shopify's own confirmation emails and admin print it — was told no order
 * matched. Whitespace from a copy/paste failed the same way.
 *
 * Deliberately narrow: only '#' and whitespace are removed. Store prefixes are part
 * of the number (this database holds `IVY-1001`), so stripping anything else would
 * turn a lookup miss into a lookup of the wrong order.
 */
export function normalizeOrderNumber(input: string | number | null | undefined): string {
  return String(input ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim();
}
