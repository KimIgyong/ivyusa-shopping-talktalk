/**
 * Notion identifiers and token shapes (PLN-260821 W1).
 *
 * Operators paste whole URLs and dashed UUIDs interchangeably; everything is
 * normalised to the bare 32-hex form once, here, so the adapter, the client and
 * the console never disagree about what "the ID" is.
 */

export class InvalidNotionInputError extends Error {}

/**
 * Pull the 32-hex object id out of whatever the operator pasted: a bare id, a
 * dashed UUID, or a notion.so URL (where the id is the LAST hex run — page
 * slugs contain the title, and a share URL may carry `?v=` view ids after it).
 */
export function extractNotionId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const dedash = (s: string) => s.replace(/-/g, '').toLowerCase();

  const bare = dedash(raw);
  if (/^[0-9a-f]{32}$/.test(bare)) return bare;

  if (/^https?:\/\//i.test(raw)) {
    // Ignore the query string: `?v=<view-id>` on a database URL is a different
    // object, and taking it would sync the wrong thing without any error.
    const path = raw.split(/[?#]/)[0];
    const matches = path.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
    if (matches?.length) return dedash(matches[matches.length - 1]);
  }
  return null;
}

/** Dashed UUID form the API paths accept (both forms work; be canonical). */
export function dashedNotionId(id32: string): string {
  return `${id32.slice(0, 8)}-${id32.slice(8, 12)}-${id32.slice(12, 16)}-${id32.slice(16, 20)}-${id32.slice(20)}`;
}

/**
 * Sanity-check an internal-integration token before storing it. Notion has
 * issued `secret_…` and, since 2024, `ntn_…` prefixes; be lenient on the
 * prefix (they may mint another) but reject obvious wrong pastes: URLs,
 * whitespace, or something far too short to be a token.
 */
export function validateNotionToken(raw: string): string | null {
  const token = raw.trim();
  if (!token) return 'A Notion integration token is required.';
  if (/\s/.test(token)) return 'The token must be a single string with no spaces.';
  if (/^https?:\/\//i.test(token)) {
    return 'That is a URL — paste the integration token from notion.so/my-integrations.';
  }
  if (token.length < 30 || token.length > 300) {
    return 'That does not look like a Notion integration token.';
  }
  return null;
}
