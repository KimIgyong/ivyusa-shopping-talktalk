import { CATALOG_SOURCE, CatalogSyncService } from './catalog-sync.service';
import { DOC_GROUP } from './entity/kb-document.entity';

/**
 * The conversion rules are the whole feature: which rows fold into one
 * document, which document a re-run must not touch, and what text an answer
 * ends up standing on.
 */
describe('CatalogSyncService', () => {
  const product = (over: Record<string, unknown> = {}) => ({
    handle: 'vita-c-serum',
    title: 'IVY Vita C Brightening Serum 30ml',
    vendor: 'IVY',
    description: 'A vitamin C serum that brightens dull skin and fades dark spots over time.',
    tags: 'serum, vitamin c, brightening',
    productUrl: 'https://ivyusa.com/products/vita-c-serum',
    status: 'active',
    ...over,
  });

  function build(products: unknown[], docs: unknown[] = []) {
    const saved: any[] = [];
    const revisions: any[] = [];
    const docRepo = {
      find: jest.fn(async () => docs),
      create: (d: any) => ({ ...d }),
      save: jest.fn(async (d: any) => {
        const row = { id: d.id ?? saved.length + 100, ...d };
        saved.push(row);
        return row;
      }),
    };
    const productRepo = { find: jest.fn(async () => products) };
    const revisionSvc = {
      record: jest.fn(async (...args: any[]) => void revisions.push(args)),
    };
    const svc = new CatalogSyncService(docRepo as never, productRepo as never, revisionSvc as never);
    return { svc, saved, revisions, docRepo };
  }

  const shades = ['Sweet & Sour', 'Purple Rain', 'Iconic Neon'].map((shade, i) =>
    product({
      handle: `kiss-gel-pro-${i}`,
      title: `Kiss New York Gel Pro Nail Polish Summer Colors - ${shade}`,
      description: `Long-wear gel polish in ${shade}. Chip resistant for up to ten days of shine.`,
      vendor: 'KISS',
    }),
  );

  describe('variant families', () => {
    it('folds shades of one product into a single document', async () => {
      const { svc, saved } = build(shades);

      const { counts } = await svc.sync(1, 9);

      expect(counts).toMatchObject({ scanned: 3, families: 1, absorbed: 2, created: 1 });
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ docGroup: DOC_GROUP.PRODUCT, source: CATALOG_SOURCE });
    });

    it('lists the absorbed variants in the body so they stay findable', async () => {
      const { svc, saved } = build(shades);

      await svc.sync(1, 9);

      expect(saved[0].content).toContain('Variants:');
      expect(saved[0].content).toContain('Purple Rain');
      expect(saved[0].content).toContain('Sweet & Sour');
    });

    it('collapses a long variant list instead of pasting 41 titles', async () => {
      const many = Array.from({ length: 30 }, (_, i) =>
        product({
          handle: `gold-finger-${i}`,
          title: `Gold Finger Glitzy 3D Press-On Nails in Design ${String(i).padStart(2, '0')}`,
          description: 'Salon-quality press-on nails with a glossy 3D finish and adhesive tabs.',
        }),
      );
      const { svc, saved } = build(many);

      await svc.sync(1, 9);

      expect(saved[0].content).toMatch(/and \d+ more/);
    });

    it('elects the longest description as representative, ties broken by handle', async () => {
      const { svc, saved } = build([
        product({ handle: 'b-short', title: 'Same Product Family Name Here', description: 'x'.repeat(100) }),
        product({ handle: 'a-long', title: 'Same Product Family Name Here', description: 'y'.repeat(300) }),
      ]);

      await svc.sync(1, 9);

      expect(saved[0].externalKey).toBe('a-long');
    });

    it('elects the member that already has a hand-written document', async () => {
      // Otherwise the family gets a new generated document while the curated
      // one covers the same product from the sidelines — two documents
      // competing for one question. 14 of 144 curated docs hit this on staging.
      const members = [
        product({
          handle: 'shade-a',
          title: 'Same Polish Family Name Here',
          description: 'z'.repeat(400),
          productUrl: 'https://ivyusa.com/products/shade-a',
        }),
        product({
          handle: 'shade-b',
          title: 'Same Polish Family Name Here',
          description: 'z'.repeat(100),
          productUrl: 'https://ivyusa.com/products/shade-b',
        }),
      ];
      const curated = {
        id: 3,
        externalKey: 'shade-b',
        source: 'knowledge_store',
        title: 'Curated polish guide',
        content: 'How to use: ...',
        category: 'KISS',
        sourceUrl: 'https://ivyusa.com/products/shade-b',
        active: 1,
        status: 'embedded',
      };
      const { svc, saved } = build(members, [curated]);

      const { counts } = await svc.sync(1, 9);

      // shade-a has the longer description but shade-b carries the curated doc.
      expect(counts).toMatchObject({ families: 1, created: 0, curatedKept: 1 });
      expect(saved).toHaveLength(0);
    });

    it('keeps genuinely different products apart', async () => {
      const { svc, saved } = build([
        product({ handle: 'serum', title: 'IVY Vita C Brightening Serum 30ml' }),
        product({ handle: 'cleanser', title: 'LAGOM Cellup Micro Pore Cleansing Oil' }),
      ]);

      const { counts } = await svc.sync(1, 9);

      expect(counts.families).toBe(2);
      expect(saved).toHaveLength(2);
    });
  });

  describe('document body', () => {
    it('carries title, description and tags — never price or sku', async () => {
      const { svc, saved } = build([product({ price: 42.5, sku: 'IVY-1' } as never)]);

      await svc.sync(1, 9);

      expect(saved[0].content).toContain('brightens dull skin');
      expect(saved[0].content).toContain('Tags: serum, vitamin c, brightening');
      expect(saved[0].content).not.toContain('42.5');
      expect(saved[0].content).not.toContain('IVY-1');
    });

    it('files the document under the brand, not product_type', async () => {
      const { svc, saved } = build([product({ vendor: 'LAGOM', category: 'Cleansing Oil' } as never)]);

      await svc.sync(1, 9);

      expect(saved[0].category).toBe('LAGOM');
    });

    it('stays active while any variant is still sold', async () => {
      const { svc, saved } = build([
        product({ handle: 'a', title: 'One Family Two Rows Here', status: 'archived' }),
        product({ handle: 'b', title: 'One Family Two Rows Here', status: 'active' }),
      ]);

      await svc.sync(1, 9);

      expect(saved[0].active).toBe(1);
    });

    it('deactivates a family whose every variant was archived', async () => {
      const { svc, saved } = build([product({ status: 'archived' })]);

      await svc.sync(1, 9);

      expect(saved[0].active).toBe(0);
    });
  });

  describe('curated documents', () => {
    const curated = {
      id: 7,
      externalKey: 'vita-c-serum',
      source: 'knowledge_store',
      title: 'IVY Vita C Serum — full guide',
      content: 'Brand: IVY\nHow to use:\n1. Apply 2 drops morning and night.',
      category: 'IVY',
      sourceUrl: 'https://ivyusa.com/products/vita-c-serum',
      active: 1,
      status: 'embedded',
    };

    it('never overwrites a hand-written body', async () => {
      const { svc, saved } = build([product()], [{ ...curated }]);

      const { counts } = await svc.sync(1, 9);

      expect(counts).toMatchObject({ curatedKept: 1, created: 0, updated: 0 });
      expect(saved).toHaveLength(0);
    });

    it('still refreshes the link and sold-out state it owns', async () => {
      const { svc, saved } = build(
        [product({ status: 'archived', productUrl: 'https://ivyusa.com/products/moved' })],
        [{ ...curated }],
      );

      const { counts } = await svc.sync(1, 9);

      expect(counts.curatedKept).toBe(1);
      expect(saved[0]).toMatchObject({
        active: 0,
        sourceUrl: 'https://ivyusa.com/products/moved',
        // The body is untouched.
        content: curated.content,
      });
    });
  });

  describe('re-runs', () => {
    it('writes nothing when the catalogue has not moved', async () => {
      const { svc, saved: firstRun } = build([product()]);
      const { counts: first } = await svc.sync(1, 9);
      expect(first.created).toBe(1);

      const generated = firstRun[0];
      const { svc: svc2, saved: secondRun } = build([product()], [{ ...generated, status: 'embedded' }]);
      const { counts: second } = await svc2.sync(1, 9);

      expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
      expect(secondRun).toHaveLength(0);
    });

    it('re-queues a document that exists but never got embedded', async () => {
      const { svc, saved: firstRun } = build([product()]);
      await svc.sync(1, 9);

      const generated = { ...firstRun[0], status: 'pending' };
      const { svc: svc2 } = build([product()], [generated]);
      const { counts, touchedIds } = await svc2.sync(1, 9);

      expect(counts.unchanged).toBe(1);
      expect(touchedIds).toEqual([generated.id]);
    });

    it('rewrites its own document when the storefront copy changed', async () => {
      const { svc, saved: firstRun } = build([product()]);
      await svc.sync(1, 9);

      const { svc: svc2, saved } = build(
        [product({ description: 'Reformulated with 15% pure vitamin C for a brighter finish.' })],
        [{ ...firstRun[0], status: 'embedded' }],
      );
      const { counts } = await svc2.sync(1, 9);

      expect(counts.updated).toBe(1);
      expect(saved[0].content).toContain('Reformulated');
      expect(saved[0].status).toBe('pending');
    });
  });

  describe('held rows', () => {
    it('holds back a product with no usable description and no tags', async () => {
      const { svc, saved } = build([product({ description: 'Nice.', tags: null })]);

      const { counts } = await svc.sync(1, 9);

      expect(counts).toMatchObject({ held: 1, families: 0, created: 0 });
      expect(saved).toHaveLength(0);
    });

    it('keeps a thin description that at least carries tags', async () => {
      const { svc } = build([product({ description: 'Nice.', tags: 'lip, gloss' })]);

      const { counts } = await svc.sync(1, 9);

      expect(counts).toMatchObject({ held: 0, created: 1 });
    });

    it('does not count held rows as absorbed variants', async () => {
      const { svc } = build([product(), product({ handle: 'x', title: 'Other Thing Entirely Now Here', description: '', tags: '' })]);

      const { counts } = await svc.sync(1, 9);

      expect(counts).toMatchObject({ scanned: 2, families: 1, held: 1, absorbed: 0 });
    });
  });

  describe('preview', () => {
    it('reports the same plan without writing anything', async () => {
      const { svc, saved, revisions } = build(shades);

      const preview = await svc.preview(1);

      expect(preview).toMatchObject({ scanned: 3, families: 1, absorbed: 2, created: 1 });
      expect(saved).toHaveLength(0);
      expect(revisions).toHaveLength(0);
    });

    it('surfaces the largest merges so a wrong one is visible before it lands', async () => {
      const { svc } = build(shades);

      const preview = await svc.preview(1);

      expect(preview.familySamples[0]).toMatchObject({ absorbed: 2 });
      expect(preview.familySamples[0].variants.length).toBeGreaterThan(0);
    });

    it('lists held products so the gap is not silent', async () => {
      const { svc } = build([product({ description: 'Nice.', tags: null })]);

      const preview = await svc.preview(1);

      expect(preview.heldSamples).toEqual([{ handle: 'vita-c-serum', title: expect.any(String) }]);
    });
  });
});
