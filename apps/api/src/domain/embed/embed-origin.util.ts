/**
 * Embed origin allowlist (PLN-260819 S1).
 *
 * ⚠️ READ THIS BEFORE BUILDING ON IT: this is NOT a security boundary. The
 * origin arrives from the browser and `curl` can send anything. What it stops is
 * an unauthorised embed in a real browser and a misconfigured install — not a
 * forger. Identity is proved by the HMAC handshake (S2), and abuse is bounded by
 * rate limits. Treating this list as authentication is the mistake it invites.
 */

/** Scheme + host (+ port only when the pattern names one), lowercased. */
export interface ParsedOrigin {
  scheme: string;
  host: string;
  port: string;
}

/**
 * Accepts a bare host (`shop.myshopify.com`), a URL, or an origin. Returns null
 * when nothing usable can be read — an unparseable value is never a match.
 */
export function parseOrigin(raw: string | null | undefined): ParsedOrigin | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  // Operators paste what the browser shows them, which is often a bare host.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    const scheme = url.protocol.replace(/:$/, '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return null;
    if (!url.hostname) return null;
    return { scheme, host: url.hostname.toLowerCase(), port: url.port };
  } catch {
    return null;
  }
}

/**
 * One allowlist entry against one origin.
 *
 * `https://*.example.com` matches any subdomain but NOT the apex — a shop that
 * wants both lists both, because "*.x" silently covering "x" is the kind of
 * surprise that gets discovered during an incident.
 *
 * The port is compared only when the pattern names one, so a plain
 * `http://localhost` entry still matches a dev server on any port.
 */
export function originMatches(pattern: string, origin: ParsedOrigin): boolean {
  const parsed = parseOrigin(pattern);
  if (!parsed) return false;
  if (parsed.scheme !== origin.scheme) return false;
  if (parsed.port && parsed.port !== origin.port) return false;

  if (!parsed.host.startsWith('*.')) return parsed.host === origin.host;

  const suffix = parsed.host.slice(2);
  if (!suffix || suffix === origin.host) return false;
  return origin.host.endsWith(`.${suffix}`);
}

/**
 * The list used when a tenant has never configured one. NULL means "not
 * configured" — the same convention as `widget_tabs` — and resolves to the
 * tenant's own storefront, which is the one place the widget obviously belongs.
 * This is what lets the column ship without a backfill and without cutting off
 * the tenants already embedding today.
 */
export function defaultOrigins(tenant: {
  shopDomain?: string | null;
  storefrontUrl?: string | null;
}): string[] {
  const out: string[] = [];
  for (const raw of [tenant.shopDomain, tenant.storefrontUrl]) {
    const parsed = parseOrigin(raw);
    if (!parsed) continue;
    const origin = `${parsed.scheme}://${parsed.host}${parsed.port ? `:${parsed.port}` : ''}`;
    if (!out.includes(origin)) out.push(origin);
  }
  return out;
}

/** Is this page allowed to embed the tenant's widget? */
export function isOriginAllowed(
  parentOrigin: string | null | undefined,
  configured: string[] | null | undefined,
  tenant: { shopDomain?: string | null; storefrontUrl?: string | null },
): boolean {
  const origin = parseOrigin(parentOrigin);
  if (!origin) return false;
  const list = configured?.length ? configured : defaultOrigins(tenant);
  // A tenant with no usable storefront on record cannot be locked down by this
  // list — refusing everything would take the widget offline instead.
  if (!list.length) return true;
  return list.some((pattern) => originMatches(pattern, origin));
}
