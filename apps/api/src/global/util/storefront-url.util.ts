/**
 * Storefront origin handling for customer-facing product links.
 *
 * `kb_documents.source_url` arrives in an operator-uploaded CSV and the widget
 * renders it as a clickable link inside a customer conversation. The widget
 * blocks `javascript:` but not `https://evil.example`, so a single upload could
 * otherwise inject arbitrary outbound links into every shopper's chat. Nothing
 * becomes a link unless it is on the tenant's own storefront.
 */

/** Normalise operator input to a bare origin; returns null if unusable. */
export function normalizeStorefrontUrl(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  const raw = input.trim();
  // Only a scheme-less host gets https:// prepended. Prefixing something that
  // already declares a scheme turns "ftp://ivyusa.com" into
  // "https://ftp://ivyusa.com", whose origin parses as "https://ftp" — a
  // plausible-looking value that would then be compared against real URLs.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null; // "https://ftp" and friends
    // Path, query and fragment are dropped: this is an origin, and keeping
    // "/collections/all" would break every comparison against it.
    return url.origin;
  } catch {
    return null;
  }
}

/** Host without a leading `www.` — the one subdomain difference users never mean. */
function canonicalHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Whether `candidate` points at the tenant's storefront.
 *
 * Subdomains must match exactly. Treating `shop.ivyusa.com` as equivalent to
 * `ivyusa.com` would let any subdomain an attacker controls through, which
 * defeats the check — `www.` is the sole exception because it is the same site
 * by convention.
 */
export function isStorefrontUrl(candidate: string | null | undefined, storefront: string | null): boolean {
  if (!candidate || !storefront) return false;
  try {
    const target = new URL(candidate);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
    const base = new URL(storefront);
    return canonicalHost(target) === canonicalHost(base);
  } catch {
    return false;
  }
}

/**
 * The link to show for a citation, or null to render it as plain text.
 *
 * Only product documents get links: policy documents carry no source_url, and
 * calling a policy page a "product recommendation" would be wrong even if they
 * did.
 */
export function productLinkFor(
  docGroup: string,
  sourceUrl: string | null,
  storefront: string | null,
): string | null {
  if (docGroup !== 'product') return null;
  return isStorefrontUrl(sourceUrl, storefront) ? (sourceUrl as string) : null;
}
