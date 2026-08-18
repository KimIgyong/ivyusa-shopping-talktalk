/**
 * Cafe24 mall-id parsing, in one place.
 *
 * There were three copies of "turn a host into a mall id" (customer-auth start,
 * install, sync) and they were free to drift. They now share this, because the
 * incident that prompted it — amoebaorder connected to the `annehearts` mall —
 * turns on exactly this comparison being the same everywhere (REQ-260819).
 */

/** A Cafe24 mall id: what the mall is called under `*.cafe24.com`. */
export const MALL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/;

const CAFE24_HOST_RE = /^([a-z0-9][a-z0-9_-]{1,59})\.cafe24\.com$/;

/** Strip protocol, path, port and case from anything host-shaped. */
function hostOf(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0];
}

/**
 * Mall id for a storefront host, or null if the host is not a Cafe24 mall.
 *
 * Accepts `mall.cafe24.com`, `https://mall.cafe24.com/path`, and a bare `mall`.
 * Anything else — a custom domain — is null: it carries no mall id to read.
 */
export function mallIdFromHost(host: string): string | null {
  const h = hostOf(host);
  const m = CAFE24_HOST_RE.exec(h);
  const mall = m ? m[1] : h.replace(/\.cafe24(api)?\.com.*$/i, '');
  return MALL_ID_RE.test(mall) ? mall : null;
}

/**
 * The mall a tenant's own storefront implies, or null when it cannot be known.
 *
 * Only `*.cafe24.com` is conclusive. A mall served from a custom domain gives us
 * nothing to compare against, and callers treat that as "cannot verify" rather
 * than "mismatch" — refusing a legitimate custom-domain install to catch a typo
 * is the wrong trade.
 */
export function expectedMallIdForTenant(tenant: {
  shopDomain?: string | null;
  storefrontUrl?: string | null;
}): string | null {
  for (const raw of [tenant.shopDomain, tenant.storefrontUrl]) {
    if (!raw) continue;
    const m = CAFE24_HOST_RE.exec(hostOf(raw));
    if (m) return m[1];
  }
  return null;
}
