/**
 * Canonical tenant login path (PLN-260824 S1): `/user/<slug>`.
 *
 * Single source for every place that builds or displays the tenant sign-in
 * URL — the legacy top-level `/<slug>` stays as a redirect for old links
 * (bookmarks, manuals, the AMA portal iframe), so only this helper should
 * ever mint new ones.
 */
export function tenantLoginPath(slug: string): string {
  return `/user/${encodeURIComponent(slug)}`;
}
