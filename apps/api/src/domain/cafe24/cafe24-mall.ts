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
 * What a tenant's own storefront says about which mall it is.
 *
 * Three outcomes, deliberately distinct — collapsing them is how this whole
 * incident stayed invisible:
 *  - `known`     one Cafe24 host, so a comparison is meaningful
 *  - `unknown`   custom domain: nothing to read, callers proceed with a warning
 *  - `ambiguous` the two fields name DIFFERENT malls, so the tenant record
 *                itself is wrong and neither value can be trusted as "verified"
 */
export type TenantMall =
  | { kind: 'known'; mallId: string }
  | { kind: 'unknown' }
  | { kind: 'ambiguous'; mallIds: string[] };

export function tenantMall(tenant: {
  shopDomain?: string | null;
  storefrontUrl?: string | null;
}): TenantMall {
  const found: string[] = [];
  for (const raw of [tenant.shopDomain, tenant.storefrontUrl]) {
    if (!raw) continue;
    const m = CAFE24_HOST_RE.exec(hostOf(raw));
    if (m && !found.includes(m[1])) found.push(m[1]);
  }
  if (found.length === 0) return { kind: 'unknown' };
  if (found.length === 1) return { kind: 'known', mallId: found[0] };
  return { kind: 'ambiguous', mallIds: found };
}

/**
 * Strip anything that could forge a log line, and bound the length.
 *
 * Both the storefront `shop` parameter and thrown error messages reach the log
 * from outside, and a CR/LF in either lets a caller write their own log entries.
 */
export function logSafe(value: unknown, max = 200): string {
  const text = value instanceof Error ? value.message : String(value ?? '');
  const flat = text.replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '');
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
