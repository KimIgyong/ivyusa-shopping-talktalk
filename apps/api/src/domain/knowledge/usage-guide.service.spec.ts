import { USAGE_GUIDE_CATEGORY, UsageGuideService } from './usage-guide.service';
import { DOC_GROUP } from './entity/kb-document.entity';
import { classifyUsageType, usageGuideKey } from './usage-guide.types';

/**
 * The ten types IVY USA had in code and now has as rows. Kept here verbatim so
 * the matching behaviour that shipped stays pinned: the migration copies these
 * into `usage_types`, and a change in either place should break this file.
 */
const IVY_TYPES = [
  { key: 'lash_adhesive', keywords: ['lash adhesive', 'eyelash adhesive', 'lash glue', 'brow glue'] },
  { key: 'lashes', keywords: ['lash', 'eyelash'] },
  { key: 'press_on_nails', keywords: ['press on', 'press-on', 'impress', 'artificial nail', 'false nail', 'fake nail'] },
  { key: 'nail_polish', keywords: ['nail polish', 'gel polish', 'nail lacquer', 'top coat', 'base coat'] },
  { key: 'hair_color', keywords: ['hair color', 'hair colour', 'hair dye', 'bleach', 'developer', 'toner kit'] },
  { key: 'wig_hairpiece', keywords: ['wig', 'ponytail', 'hairpiece', 'hair piece', 'weave', 'braid', 'bundle', 'closure', 'frontal'] },
  { key: 'heated_tool', keywords: ['flat iron', 'curling', 'blow dry', 'hair dryer', 'heated', 'straightener', 'hot comb'] },
  { key: 'skincare', keywords: ['serum', 'ampoule', 'toner', 'essence', 'moisturizer', 'cream', 'cleanser', 'mask', 'sunscreen', 'spf', 'peeling', 'exfoliat', 'cleansing'] },
  { key: 'makeup', keywords: ['lipstick', 'lip oil', 'lip gloss', 'lip balm', 'concealer', 'foundation', 'mascara', 'eyeliner', 'eyebrow', 'brow pencil', 'blush', 'powder', 'primer', 'palette', 'makeup'] },
  { key: 'edge_styling', keywords: ['edge control', 'styling gel', 'hair wax', 'pomade', 'hair oil', 'hair spray', 'mousse'] },
];

/** As rows, in match order, for the service tests. */
const ivyRows = IVY_TYPES.map((t, i) => ({
  id: i + 1,
  key: t.key,
  label: t.key,
  keywords: t.keywords.join('\n'),
  sortOrder: (i + 1) * 10,
  active: 1,
}));

describe('classifyUsageType', () => {
  it.each([
    ['KISS imPRESS The No Glue Mani Press-On Nails - This Luv', 'press_on_nails'],
    ['Kiss New York Gel Pro Nail Polish Core Colors - Glow Up', 'nail_polish'],
    ['i·ENVY Strip Lashes Natural', 'lashes'],
    ['RED by KISS Hair Color Permanent Cream', 'hair_color'],
    ['LAGOM Cellup Micro Pore Cleansing Oil', 'skincare'],
    ['Ruby Kisses Hydrating Lip Oil Treatment', 'makeup'],
    ['RED by KISS Edge Control Travel Duo', 'edge_styling'],
    ['RED by KISS Heated Roll Brush 2 in 1 Curling Iron', 'heated_tool'],
  ])('%s → %s', (title, expected) => {
    expect(classifyUsageType({ title }, IVY_TYPES)).toBe(expected);
  });

  it('puts an adhesive under its own type, not under lashes', () => {
    // Both titles contain "lash"; the adhesive needs different steps, which is
    // why its rule is ordered first.
    expect(classifyUsageType({ title: 'i-ENVY Lash Adhesive Strip Lash Glue' }, IVY_TYPES)).toBe(
      'lash_adhesive',
    );
  });

  it('returns null for products a usage guide would not help', () => {
    // A guide here would be padding, and padding competes for retrieval slots.
    expect(classifyUsageType({ title: 'Arria 14K Gold Plated Figaro Chain Bracelet' }, IVY_TYPES)).toBeNull();
    expect(classifyUsageType({ title: 'éclat 100% Pure Cotton Rounds' }, IVY_TYPES)).toBeNull();
  });

  it('falls back to product type and tags when the title says nothing', () => {
    expect(classifyUsageType({ title: 'Glow Set No. 3', category: 'Strip Lashes' }, IVY_TYPES)).toBe('lashes');
    expect(classifyUsageType({ title: 'Glow Set No. 3', tags: 'gift, serum, vegan' }, IVY_TYPES)).toBe(
      'skincare',
    );
  });
});

describe('UsageGuideService', () => {
  const build = (products: unknown[] = [], docs: unknown[] = []) => {
    const saved: any[] = [];
    const docRepo = {
      find: jest.fn(async () => docs),
      findOne: jest.fn(async ({ where }: any) =>
        (docs as any[]).find((d) => d.externalKey === where.externalKey) ?? null,
      ),
      create: (d: any) => ({ ...d }),
      save: jest.fn(async (d: any) => {
        const row = { id: d.id ?? 501, updatedAt: new Date('2026-08-08T00:00:00Z'), ...d };
        saved.push(row);
        return row;
      }),
    };
    const productRepo = { find: jest.fn(async () => products) };
    const revisions = { record: jest.fn(async () => undefined) };
    const types = { list: jest.fn(async () => ivyRows) };
    return {
      svc: new UsageGuideService(
        docRepo as never,
        productRepo as never,
        revisions as never,
        types as never,
      ),
      saved,
      revisions,
      types,
    };
  };

  describe('list', () => {
    it('reports every type, including the ones nobody has written', async () => {
      const { svc } = build([{ title: 'Press-On Nails Set', category: null, tags: null }]);

      const guides = await svc.list(1);

      expect(guides).toHaveLength(ivyRows.length);
      expect(guides.find((g) => g.key === 'press_on_nails')).toMatchObject({
        productCount: 1,
        documentId: null,
      });
      expect(guides.find((g) => g.key === 'hair_color')).toMatchObject({
        productCount: 0,
        documentId: null,
      });
    });

    it('links a written guide to its document', async () => {
      const { svc } = build(
        [{ title: 'Strip Lashes Natural', category: null, tags: null }],
        [
          {
            id: 88,
            externalKey: usageGuideKey('lashes'),
            title: 'How to apply strip lashes',
            updatedAt: new Date('2026-08-08T09:00:00Z'),
          },
        ],
      );

      const guides = await svc.list(1);

      expect(guides.find((g) => g.key === 'lashes')).toMatchObject({
        documentId: '88',
        title: 'How to apply strip lashes',
        productCount: 1,
      });
    });

    it('counts a product once, under the first type that claims it', async () => {
      const { svc } = build([
        { title: 'i-ENVY Lash Adhesive Strip Lash Glue', category: null, tags: null },
      ]);

      const guides = await svc.list(1);

      expect(guides.find((g) => g.key === 'lash_adhesive')?.productCount).toBe(1);
      expect(guides.find((g) => g.key === 'lashes')?.productCount).toBe(0);
    });
  });

  describe('upsert', () => {
    it('creates the guide in the product group so it is cited with the products', async () => {
      const { svc, saved } = build();

      await svc.upsert(1, 'press_on_nails', { title: 'How to apply', content: 'x'.repeat(50) }, 9);

      expect(saved[0]).toMatchObject({
        docGroup: DOC_GROUP.PRODUCT,
        category: USAGE_GUIDE_CATEGORY,
        externalKey: 'usage:press_on_nails',
        // Not the converter's source — the catalogue sync must never treat a
        // hand-written guide as its own to overwrite.
        source: 'knowledge_store',
        status: 'pending',
        active: 1,
      });
    });

    it('rewrites the existing guide instead of creating a second one', async () => {
      const existing = {
        id: 88,
        externalKey: usageGuideKey('lashes'),
        title: 'Old',
        content: 'old body',
        status: 'embedded',
        active: 1,
      };
      const { svc, saved } = build([], [existing]);

      await svc.upsert(1, 'lashes', { title: 'New', content: 'y'.repeat(50) }, 9);

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ id: 88, title: 'New', status: 'pending' });
    });

    it('records a revision so a guide can be rolled back like any document', async () => {
      const { svc, revisions } = build();

      await svc.upsert(1, 'skincare', { title: 'Routine order', content: 'z'.repeat(50) }, 9);

      expect(revisions.record).toHaveBeenCalledTimes(1);
    });

    it('rejects a type this tenant does not have', async () => {
      // Not "a type that does not exist" any more: the list is per tenant, so
      // the question is whether THIS tenant has it. A stale console tab must
      // not file a guide under another shop's vocabulary.
      const { svc } = build();

      await expect(
        svc.upsert(1, 'sunglasses', { title: 'x', content: 'z'.repeat(50) }, 9),
      ).rejects.toThrow();
    });
  });
});
