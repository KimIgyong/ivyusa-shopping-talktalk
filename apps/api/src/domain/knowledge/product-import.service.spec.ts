import { Repository } from 'typeorm';
import { ProductImportService } from './product-import.service';
import { KbDocument } from './entity/kb-document.entity';
import { KbRevisionService } from './kb-revision.service';

const HEADER = 'Product Name,Brand,Category,SKU,Price(USD),Product URL,Image URL,Detail,How to Use,Tags,Handle';
const row = (over: Partial<Record<string, string>> = {}) => {
  const f = {
    name: 'Arocell Super Collagen Mask',
    brand: 'Arocell',
    category: 'Skin Care Masks & Peels',
    sku: 'ARC15',
    price: '12.56',
    url: 'https://ivyusa.com/products/super-collagen-mask',
    image: 'https://cdn.shopify.com/x.jpg',
    detail: 'A hydrogel mask with a 1.5oz collagen ampoule.',
    how: 'Apply to clean skin for 20 minutes.',
    tags: 'mask, collagen',
    handle: 'super-collagen-mask',
    ...over,
  };
  return `${f.name},${f.brand},${f.category},${f.sku},${f.price},${f.url},${f.image},"${f.detail}","${f.how}","${f.tags}",${f.handle}`;
};

describe('ProductImportService.importCsv', () => {
  let saved: KbDocument[];
  let recorded: string[];

  const build = (existing: Partial<KbDocument>[] = []) => {
    saved = [];
    recorded = [];
    let nextId = 900;
    const docRepo = {
      find: jest.fn(async () => existing as KbDocument[]),
      create: (d: Partial<KbDocument>) => d as KbDocument,
      save: jest.fn(async (d: KbDocument) => {
        const withId = { ...d, id: d.id ?? nextId++ } as KbDocument;
        saved.push(withId);
        return withId;
      }),
    } as unknown as Repository<KbDocument>;
    const revisions = {
      record: jest.fn(async (_t: number, _d: unknown, _b: unknown, kind: string) => {
        recorded.push(kind);
        return null;
      }),
    } as unknown as KbRevisionService;
    return new ProductImportService(docRepo, revisions);
  };

  it('creates a ProductInfo document keyed by Handle', async () => {
    const svc = build();
    const { result, touchedIds } = await svc.importCsv(1, `${HEADER}\n${row()}`, 7);
    expect(result).toMatchObject({ parsed: 1, created: 1, updated: 0, skipped: 0, invalid: 0 });
    expect(touchedIds).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      docGroup: 'product',
      externalKey: 'super-collagen-mask',
      title: 'Arocell Super Collagen Mask',
      status: 'pending',
      sourceUrl: 'https://ivyusa.com/products/super-collagen-mask',
    });
  });

  it('keeps the price out of the document body', async () => {
    // A price frozen into the vector index goes stale silently, and a wrong
    // price in a customer answer is a dispute rather than a typo.
    const svc = build();
    await svc.importCsv(1, `${HEADER}\n${row()}`, 7);
    expect(saved[0].content).not.toContain('12.56');
    expect(saved[0].content).toContain('A hydrogel mask');
    expect(saved[0].content).toContain('How to use:');
    expect(saved[0].content).toContain('Tags: mask, collagen');
  });

  it('uses Brand as the category, falling back to Category when Brand is blank', async () => {
    // Category is only 65% filled in the real export; Brand is 96%.
    const svc = build();
    await svc.importCsv(1, `${HEADER}\n${row({ brand: '' })}`, 7);
    expect(saved[0].category).toBe('Skin Care Masks & Peels');
  });

  it('leaves category null when neither column is present', async () => {
    const svc = build();
    await svc.importCsv(1, `${HEADER}\n${row({ brand: '', category: '' })}`, 7);
    expect(saved[0].category).toBeNull();
  });

  it('skips a row with no Handle and reports it rather than failing the import', async () => {
    const svc = build();
    const csv = `${HEADER}\n${row({ handle: '' })}\n${row({ handle: 'ok-1' })}`;
    const { result } = await svc.importCsv(1, csv, 7);
    expect(result).toMatchObject({ parsed: 2, created: 1, invalid: 1 });
    expect(result.errors[0]).toMatchObject({ row: 2, reason: 'Handle is empty' });
  });

  it('reports a Handle repeated within one file instead of letting the last row win', async () => {
    const svc = build();
    const csv = `${HEADER}\n${row()}\n${row({ name: 'Different product' })}`;
    const { result } = await svc.importCsv(1, csv, 7);
    expect(result).toMatchObject({ created: 1, invalid: 1 });
    expect(result.errors[0].reason).toContain('duplicate Handle');
  });

  it('re-importing an unchanged catalogue changes nothing', async () => {
    // Otherwise a routine re-upload would re-embed every product and fill the
    // revision history with no-op entries.
    const svc = build([
      {
        id: 10,
        tenantId: 1,
        docGroup: 'product',
        externalKey: 'super-collagen-mask',
        title: 'Arocell Super Collagen Mask',
        category: 'Arocell',
        sourceUrl: 'https://ivyusa.com/products/super-collagen-mask',
        status: 'embedded',
        content:
          'Brand: Arocell\nArocell Super Collagen Mask\n\nA hydrogel mask with a 1.5oz collagen ampoule.\n\nHow to use:\nApply to clean skin for 20 minutes.\n\nTags: mask, collagen',
      },
    ]);
    const { result, touchedIds } = await svc.importCsv(1, `${HEADER}\n${row()}`, 7);
    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(touchedIds).toHaveLength(0);
    expect(saved).toHaveLength(0);
    expect(recorded).toHaveLength(0);
  });

  it('re-indexes an unchanged row that never got embedded', async () => {
    // A partial earlier run leaves rows at status='pending'. Skipping them on
    // content equality alone would leave them permanently unsearchable —
    // observed locally: 144 imported, only 108 indexed.
    const svc = build([
      {
        id: 10,
        tenantId: 1,
        docGroup: 'product',
        externalKey: 'super-collagen-mask',
        title: 'Arocell Super Collagen Mask',
        category: 'Arocell',
        sourceUrl: 'https://ivyusa.com/products/super-collagen-mask',
        status: 'pending',
        content:
          'Brand: Arocell\nArocell Super Collagen Mask\n\nA hydrogel mask with a 1.5oz collagen ampoule.\n\nHow to use:\nApply to clean skin for 20 minutes.\n\nTags: mask, collagen',
      },
    ]);
    const { result, touchedIds } = await svc.importCsv(1, `${HEADER}\n${row()}`, 7);
    expect(result).toMatchObject({ skipped: 1, updated: 0, created: 0 });
    // Counted as unchanged, but still handed to the embedder.
    expect(touchedIds).toEqual([10]);
    // No pointless revision for a body that did not move.
    expect(recorded).toHaveLength(0);
  });

  it('updates only the rows whose content actually moved', async () => {
    const svc = build([
      {
        id: 10,
        tenantId: 1,
        docGroup: 'product',
        externalKey: 'super-collagen-mask',
        title: 'Old name',
        category: 'Arocell',
        sourceUrl: 'https://ivyusa.com/products/super-collagen-mask',
        content: 'stale body',
      },
    ]);
    const { result } = await svc.importCsv(1, `${HEADER}\n${row()}`, 7);
    expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(saved[0]).toMatchObject({ id: 10, title: 'Arocell Super Collagen Mask', status: 'pending' });
    expect(recorded).toEqual(['update']);
  });

  it('rejects a file missing a required column', async () => {
    const svc = build();
    await expect(svc.importCsv(1, 'Product Name,Handle\nA,a-1', 7)).rejects.toThrow();
  });

  it('never embeds inline — it only marks rows pending', async () => {
    // Embedding per row would issue one single-text call per product, which the
    // adapter does not retry (PR #95). The caller batches instead.
    const svc = build();
    const { touchedIds } = await svc.importCsv(1, `${HEADER}\n${row()}\n${row({ handle: 'b' })}`, 7);
    expect(touchedIds).toHaveLength(2);
    expect(saved.every((d) => d.status === 'pending')).toBe(true);
  });

  it('reports products missing from the file without deleting them', async () => {
    const svc = build([
      { id: 10, tenantId: 1, docGroup: 'product', externalKey: 'gone-product', title: 'Gone' },
      { id: 11, tenantId: 1, docGroup: 'product', externalKey: 'super-collagen-mask', title: 'Kept' },
    ]);
    const stale = await svc.staleProducts(1, ['super-collagen-mask']);
    expect(stale.map((d) => d.externalKey)).toEqual(['gone-product']);
  });
});
