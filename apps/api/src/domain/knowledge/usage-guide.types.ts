/**
 * Product types worth writing a usage guide for (PLN-260807 P2).
 *
 * Usage instructions belong to a TYPE, not to a product: the steps for applying
 * press-on nails are the same for all 329 of them. That is what makes this
 * tractable — the storefront publishes no usage text at all (31 of 2,275
 * products carry any, REQ-260807 §0-1), and ten guides cover 1,416 products.
 *
 * "Worth it" is the filter. Anklets, cotton rounds and sunglasses are left out:
 * a guide for them would be padding, and padding competes for retrieval slots
 * with documents that answer something.
 *
 * Order matters — the first match wins. `lash_adhesive` precedes `lashes`
 * because an adhesive is titled "Lash Adhesive" and needs its own steps.
 */
export interface UsageType {
  key: string;
  /** Matched against title + product_type + tags, lower-cased. */
  keywords: string[];
}

export const USAGE_TYPES: UsageType[] = [
  { key: 'lash_adhesive', keywords: ['lash adhesive', 'eyelash adhesive', 'lash glue', 'brow glue'] },
  { key: 'lashes', keywords: ['lash', 'eyelash'] },
  {
    key: 'press_on_nails',
    keywords: ['press on', 'press-on', 'impress', 'artificial nail', 'false nail', 'fake nail'],
  },
  {
    key: 'nail_polish',
    keywords: ['nail polish', 'gel polish', 'nail lacquer', 'top coat', 'base coat'],
  },
  {
    key: 'hair_color',
    keywords: ['hair color', 'hair colour', 'hair dye', 'bleach', 'developer', 'toner kit'],
  },
  {
    key: 'wig_hairpiece',
    keywords: ['wig', 'ponytail', 'hairpiece', 'hair piece', 'weave', 'braid', 'bundle', 'closure', 'frontal'],
  },
  {
    key: 'heated_tool',
    keywords: ['flat iron', 'curling', 'blow dry', 'hair dryer', 'heated', 'straightener', 'hot comb'],
  },
  {
    key: 'skincare',
    keywords: [
      'serum', 'ampoule', 'toner', 'essence', 'moisturizer', 'cream', 'cleanser',
      'mask', 'sunscreen', 'spf', 'peeling', 'exfoliat', 'cleansing',
    ],
  },
  {
    key: 'makeup',
    keywords: [
      'lipstick', 'lip oil', 'lip gloss', 'lip balm', 'concealer', 'foundation',
      'mascara', 'eyeliner', 'eyebrow', 'brow pencil', 'blush', 'powder', 'primer',
      'palette', 'makeup',
    ],
  },
  {
    key: 'edge_styling',
    keywords: ['edge control', 'styling gel', 'hair wax', 'pomade', 'hair oil', 'hair spray', 'mousse'],
  },
];

/** `external_key` of the guide document for a type — stable, so writes upsert. */
export function usageGuideKey(typeKey: string): string {
  return `usage:${typeKey}`;
}

/** The type a product belongs to, or null when no guide would help it. */
export function classifyUsageType(fields: {
  title: string;
  category?: string | null;
  tags?: string | null;
}): string | null {
  const haystack = `${fields.title} ${fields.category ?? ''} ${fields.tags ?? ''}`.toLowerCase();
  return USAGE_TYPES.find((t) => t.keywords.some((k) => haystack.includes(k)))?.key ?? null;
}
