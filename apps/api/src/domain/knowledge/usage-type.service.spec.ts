import { UsageTypeService } from './usage-type.service';
import { slugifyTypeKey, parseKeywords, DEFAULT_USAGE_TYPES } from './usage-guide.types';

describe('slugifyTypeKey', () => {
  it('derives a key from the label', () => {
    expect(slugifyTypeKey('Care & storage')).toBe('care_storage');
  });

  it('suffixes rather than collides — the key is half of a document key', () => {
    expect(slugifyTypeKey('Care & storage', ['care_storage'])).toBe('care_storage_2');
  });

  it('falls back for a label with no ASCII, instead of producing an empty key', () => {
    // Korean and Vietnamese labels are expected (staging already has 립, 아이).
    // Transliterating them would invent a key nobody typed.
    expect(slugifyTypeKey('립 메이크업')).toBe('type');
    expect(slugifyTypeKey('아이', ['type'])).toBe('type_2');
  });
});

describe('parseKeywords', () => {
  it('drops blank lines — a blank keyword would match everything', () => {
    expect(parseKeywords('cotton\n\n  linen  \n')).toEqual(['cotton', 'linen']);
  });

  it('treats no keywords as no matches', () => {
    expect(parseKeywords(null)).toEqual([]);
  });
});

describe('UsageTypeService', () => {
  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 1,
    tenantId: 1,
    key: 'k',
    label: 'L',
    keywords: null,
    sortOrder: 10,
    active: 1,
    ...over,
  });

  const build = (rows: unknown[] = [], products: unknown[] = []) => {
    const saved: any[] = [];
    const repo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) =>
        (rows as any[]).find((r) => String(r.id) === String(where.id)) ?? null,
      ),
      count: jest.fn(async () => rows.length),
      create: (d: any) => ({ ...d }),
      save: jest.fn(async (d: any) => {
        const out = Array.isArray(d) ? d : { id: d.id ?? 99, ...d };
        saved.push(out);
        return out;
      }),
    };
    const productRepo = { find: jest.fn(async () => products) };
    return { svc: new UsageTypeService(repo as never, productRepo as never), saved, repo };
  };

  it('appends a new type below the existing ones', async () => {
    // Inserting above an existing rule would silently reclassify products the
    // operator never touched — first match wins.
    const { svc, saved } = build([row({ id: 1, sortOrder: 10 }), row({ id: 2, sortOrder: 20 })]);

    await svc.create(1, { label: 'Laundry care', keywords: ['cotton'] });

    expect(saved[0]).toMatchObject({ key: 'laundry_care', sortOrder: 30, keywords: 'cotton' });
  });

  it('leaves the key alone when the label is renamed', async () => {
    const { svc, saved } = build([row({ id: 1, key: 'care_storage', label: 'Care & storage' })]);

    await svc.update(1, 1, { label: 'Fabric care' });

    // The guide document is keyed `usage:care_storage`; a new key orphans it.
    expect(saved[0]).toMatchObject({ key: 'care_storage', label: 'Fabric care' });
  });

  describe('preview', () => {
    const products = [
      { title: 'Botanical Cotton Shirt', category: 'All', tags: '' },
      { title: 'Fluid Lounge Pants', category: 'All', tags: 'linen' },
      { title: 'Wool Blend Coat', category: 'All', tags: '' },
    ];

    it('counts what the keywords would claim and shows the evidence', async () => {
      const { svc } = build([], products);

      const res = await svc.preview(1, ['cotton', 'linen']);

      expect(res.matched).toBe(2);
      expect(res.samples).toEqual(['Botanical Cotton Shirt', 'Fluid Lounge Pants']);
    });

    it('says who took them, so "0" is not read as "wrong keywords"', async () => {
      // The likeliest mistake is typing terms an existing type already covers.
      // The count would be honest and the conclusion drawn from it wrong.
      const rows = [row({ id: 1, key: 'linens', label: 'Linens', keywords: 'linen\ncotton', sortOrder: 10 })];
      const { svc } = build(rows, products);

      const res = await svc.preview(1, ['cotton', 'linen']);

      expect(res).toMatchObject({ matched: 0, takenByOthers: 2, takenBy: 'Linens' });
    });

    it('subtracts what the types above it already claim', async () => {
      // Otherwise the preview promises products this type will never receive:
      // a higher rule tests first and takes them.
      const rows = [
        row({ id: 1, key: 'linens', keywords: 'linen', sortOrder: 10 }),
        row({ id: 2, key: 'fabric', keywords: 'cotton', sortOrder: 20 }),
      ];
      const { svc } = build(rows, products);

      const res = await svc.preview(1, ['cotton', 'linen'], { excludeId: 2 });

      expect(res.matched).toBe(1);
      expect(res.samples).toEqual(['Botanical Cotton Shirt']);
    });

    it('reports zero for no keywords without reading the catalogue', async () => {
      const { svc } = build([], products);

      expect(await svc.preview(1, ['   '])).toEqual({
        matched: 0,
        samples: [],
        takenByOthers: 0,
        takenBy: null,
      });
    });
  });

  describe('seedDefaults', () => {
    it('gives a brand-new tenant the neutral set', async () => {
      const { svc, saved } = build([]);

      await svc.seedDefaults(7);

      expect(saved).toHaveLength(DEFAULT_USAGE_TYPES.length);
      expect(saved.map((r) => r.key)).toEqual(DEFAULT_USAGE_TYPES.map((t) => t.key));
      // No keywords: "0 products" is the prompt to write terms that fit this
      // catalogue, and guessing them would produce confident nonsense.
      expect(saved.every((r) => r.keywords === null)).toBe(true);
    });

    it('does nothing when the tenant already has types', async () => {
      const { svc, saved } = build([row()]);

      await svc.seedDefaults(1);

      expect(saved).toHaveLength(0);
    });
  });
});
