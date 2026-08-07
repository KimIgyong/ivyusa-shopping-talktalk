import { USAGE_GUIDE_CATEGORY, UsageGuideService } from './usage-guide.service';
import { DOC_GROUP } from './entity/kb-document.entity';
import { classifyUsageType, USAGE_TYPES, usageGuideKey } from './usage-guide.types';

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
    expect(classifyUsageType({ title })).toBe(expected);
  });

  it('puts an adhesive under its own type, not under lashes', () => {
    // Both titles contain "lash"; the adhesive needs different steps, which is
    // why its rule is ordered first.
    expect(classifyUsageType({ title: 'i-ENVY Lash Adhesive Strip Lash Glue' })).toBe(
      'lash_adhesive',
    );
  });

  it('returns null for products a usage guide would not help', () => {
    // A guide here would be padding, and padding competes for retrieval slots.
    expect(classifyUsageType({ title: 'Arria 14K Gold Plated Figaro Chain Bracelet' })).toBeNull();
    expect(classifyUsageType({ title: 'éclat 100% Pure Cotton Rounds' })).toBeNull();
  });

  it('falls back to product type and tags when the title says nothing', () => {
    expect(classifyUsageType({ title: 'Glow Set No. 3', category: 'Strip Lashes' })).toBe('lashes');
    expect(classifyUsageType({ title: 'Glow Set No. 3', tags: 'gift, serum, vegan' })).toBe(
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
    return {
      svc: new UsageGuideService(docRepo as never, productRepo as never, revisions as never),
      saved,
      revisions,
    };
  };

  describe('list', () => {
    it('reports every type, including the ones nobody has written', async () => {
      const { svc } = build([{ title: 'Press-On Nails Set', category: null, tags: null }]);

      const guides = await svc.list(1);

      expect(guides).toHaveLength(USAGE_TYPES.length);
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

    it('rejects a type that does not exist', async () => {
      const { svc } = build();

      await expect(
        svc.upsert(1, 'sunglasses', { title: 'x', content: 'z'.repeat(50) }, 9),
      ).rejects.toThrow();
    });
  });
});
