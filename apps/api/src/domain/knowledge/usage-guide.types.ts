/**
 * Matching rules for usage guides (PLN-260824 A축).
 *
 * Usage instructions belong to a TYPE, not to a product: the steps for applying
 * press-on nails are the same for all 329 of them. That is what makes this
 * tractable — ten guides can cover 1,416 products.
 *
 * The types themselves used to be ten constants here, tuned to one tenant's
 * K-beauty catalogue. They now live in `usage_types`, one set per tenant, and
 * this file keeps only the matching logic and the neutral defaults a brand-new
 * tenant starts from.
 */

/** The shape the matcher needs — a row from `usage_types`, or a seed. */
export interface UsageTypeMatcher {
  key: string;
  /** Matched against title + product_type + tags, lower-cased. */
  keywords: readonly string[];
}

/**
 * What a new tenant starts with (PLN D4).
 *
 * Deliberately about *how you treat a thing you bought*, not about what it is.
 * The previous default — one shop's ten beauty categories — is the bug this
 * replaces: an apparel tenant was offered "Press-on nails" and had nowhere to
 * put laundry care.
 *
 * No keywords. A type that matches nothing shows "0 products" next to it, which
 * is the prompt to go and write the terms that fit this catalogue; guessing
 * terms for a catalogue we have not seen would produce confident nonsense.
 */
export const DEFAULT_USAGE_TYPES: readonly { key: string; label: string }[] = [
  { key: 'how_to_use', label: 'How to use' },
  { key: 'care_storage', label: 'Care & storage' },
  { key: 'cautions', label: 'Cautions' },
];

/** `external_key` of the guide document for a type — stable, so writes upsert. */
export function usageGuideKey(typeKey: string): string {
  return `usage:${typeKey}`;
}

/** Stored newline-separated; blank lines are not match-anything rules. */
export function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

export function serializeKeywords(keywords: readonly string[]): string | null {
  const cleaned = keywords.map((k) => k.trim()).filter((k) => k.length > 0);
  return cleaned.length ? cleaned.join('\n') : null;
}

/**
 * A stable key derived from a label, for a type the operator just named.
 *
 * The key is permanent once created — it is half of the guide's `external_key`
 * — so it is derived from the label once and then left alone even if the label
 * is renamed later. Non-ASCII labels are common (`립`, `아이`), and stripping
 * them would leave an empty key, so those fall back to a numbered key rather
 * than to a transliteration nobody asked for.
 */
export function slugifyTypeKey(label: string, taken: readonly string[] = []): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'type';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/**
 * The type a product belongs to, or null when no guide would help it.
 *
 * `types` is ordered and the first match wins, which is the whole reason the
 * rows carry a sort order: "lash adhesive" has to be tested before "lash", or
 * an adhesive is filed under lashes and gets the wrong steps.
 */
export function classifyUsageType(
  fields: { title: string; category?: string | null; tags?: string | null },
  types: readonly UsageTypeMatcher[],
): string | null {
  const haystack = `${fields.title} ${fields.category ?? ''} ${fields.tags ?? ''}`.toLowerCase();
  return types.find((t) => t.keywords.some((k) => k.length > 0 && haystack.includes(k)))?.key ?? null;
}
