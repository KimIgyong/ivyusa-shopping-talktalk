import { Cafe24ProductSyncService } from './cafe24-product-sync.service';
import { Cafe24AdminClient, Cafe24Product } from './cafe24-admin.client';
import { ProductCache } from '../product/entity/product-cache.entity';
import { Tenant } from '../tenant/entity/tenant.entity';

/** Cafe24 catalogue → products_cache (PLN-260808-Cafe24-Product-Knowledge P2). */
describe('Cafe24ProductSyncService.syncProducts', () => {
  const tenant = { id: 5, storefrontUrl: 'https://amoebaorder.cafe24.com/' } as Tenant;

  const product = (over: Partial<Cafe24Product> = {}): Cafe24Product => ({
    product_no: 27,
    product_code: 'P000000A',
    product_name: '플로리아 메이크업 리무버',
    description: `<p>${'순한 성분으로 짙은 메이크업까지 부드럽게 지워내는 리무버입니다. '.repeat(3)}</p>`,
    price: '18000.00',
    display: 'T',
    selling: 'T',
    has_option: 'F',
    category: [{ category_no: 1 }],
    detail_image: '//amoebaorder.cafe24.com/web/product/big/floria.jpg',
    created_date: '2026-07-01T00:00:00+09:00',
    ...over,
  });

  /**
   * @param pages  successive `GET /products` responses
   * @param over   client method overrides (detail, options, categories)
   */
  function build(
    pages: Cafe24Product[][],
    over: Partial<Record<'fetchProduct' | 'fetchProductOptions' | 'listCategoryNames', unknown>> = {},
    existing: Partial<ProductCache>[] = [],
  ) {
    const saved: ProductCache[] = [];
    let nextId = 100;
    const productRepo = {
      find: jest.fn().mockResolvedValue(existing as ProductCache[]),
      create: (p: Partial<ProductCache>) => p as ProductCache,
      save: jest.fn(async (p: ProductCache) => {
        const withId = p.id != null ? p : ({ ...p, id: nextId++ } as ProductCache);
        saved.push({ ...withId });
        return withId;
      }),
    };
    const tenantRepo = { findOne: jest.fn().mockResolvedValue(tenant) };
    const tokenService = {
      getConnection: jest.fn().mockResolvedValue({ mallId: 'amoebaorder', accessToken: 'tok' }),
    };
    let call = 0;
    const client = {
      pullProducts: jest.fn(async () => pages[call++] ?? []),
      fetchProduct: jest.fn(async () => null),
      fetchProductOptions: jest.fn(async () => []),
      listCategoryNames: jest.fn(async () => new Map([[1, '클렌징']])),
      ...over,
    } as unknown as Cafe24AdminClient;

    const svc = new Cafe24ProductSyncService(
      productRepo as never,
      tenantRepo as never,
      tokenService as never,
      client,
    );
    return { svc, saved, client, tokenService, productRepo };
  }

  it('maps a Cafe24 product onto the cache row', async () => {
    const { svc, saved } = build([[product()]]);

    const res = await svc.syncProducts(5);

    expect(res).toMatchObject({ ok: true, synced: 1, archived: 0 });
    expect(saved[0]).toMatchObject({
      tenantId: 5,
      // Keyed on product_no, never a name slug: a renamed product must stay the
      // same knowledge document.
      handle: 'cafe24-27',
      title: '플로리아 메이크업 리무버',
      sku: 'P000000A',
      price: 18000,
      currency: 'KRW',
      category: '클렌징',
      // Canonical detail URL on the tenant's own storefront origin — the only
      // form productLinkFor() will render as a clickable citation.
      productUrl: 'https://amoebaorder.cafe24.com/product/detail.html?product_no=27',
      imageUrl: 'https://amoebaorder.cafe24.com/web/product/big/floria.jpg',
      status: 'active',
    });
    expect(saved[0].description).toContain('순한 성분으로');
    expect(saved[0].tags).toBe('클렌징');
  });

  it('fills tags from options so an image-only product still reaches the knowledge base', async () => {
    // The converter holds back a product whose description is thin AND whose
    // tags are empty — the exact shape of a Korean mall's image-only detail page.
    const { svc, saved } = build(
      [[product({ description: '<img src="detail.jpg">', has_option: 'T', category: [] })]],
      {
        fetchProduct: jest.fn(async () => null),
        fetchProductOptions: jest.fn(async () => [
          { option_name: '색상', option_value: [{ option_text: '로즈' }, { option_text: '코랄' }] },
        ]),
        listCategoryNames: jest.fn(async () => new Map()),
      },
    );

    await svc.syncProducts(5);

    expect(saved[0].tags).toBe('로즈, 코랄');
  });

  it('falls back to the product name when nothing else can be tagged', async () => {
    const { svc, saved } = build(
      [[product({ description: null, category: [], has_option: 'F', brand_code: 'B0000000' })]],
      { listCategoryNames: jest.fn(async () => new Map()) },
    );
    await svc.syncProducts(5);
    // The brand code is not a tag: `B0000000` is Cafe24's "no brand" default and
    // sat on every product of the pilot mall, reaching the shopper's snippet.
    expect(saved[0].tags).toBe('플로리아 메이크업 리무버');
  });

  it('asks the detail resource only when the list row carries no usable text', async () => {
    const fetchProduct = jest.fn(async () => ({
      description: `<p>${'상세 설명 텍스트입니다. '.repeat(10)}</p>`,
    }));
    const { svc, saved, client } = build([[product({ description: null })]], { fetchProduct });
    await svc.syncProducts(5);
    expect(client.fetchProduct).toHaveBeenCalledWith('amoebaorder', 'tok', 27);
    expect(saved[0].description).toContain('상세 설명 텍스트입니다.');

    const rich = build([[product()]]);
    await rich.svc.syncProducts(5);
    expect(rich.client.fetchProduct).not.toHaveBeenCalled();
  });

  it('archives a product the mall no longer serves — but only after a complete run', async () => {
    const gone = { id: 1, handle: 'cafe24-99', status: 'active' } as ProductCache;
    const { svc, saved } = build([[product()]], {}, [gone]);

    const res = await svc.syncProducts(5);

    expect(res.archived).toBe(1);
    expect(saved.find((p) => p.handle === 'cafe24-99')?.status).toBe('archived');
  });

  it('archives nothing when the run is interrupted', async () => {
    const { svc, saved } = build([], {
      pullProducts: jest.fn(async () => {
        throw new Error('502 Bad Gateway');
      }),
    }, [{ id: 1, handle: 'cafe24-99', status: 'active' } as ProductCache]);

    const res = await svc.syncProducts(5);

    expect(res).toMatchObject({ ok: false, synced: 0, archived: 0 });
    expect(res.detail).toContain('502');
    expect(saved).toHaveLength(0);
  });

  it('leaves rows from another source alone in the archive pass', async () => {
    const shopifyRow = { id: 2, handle: 'vita-c-serum', status: 'active' } as ProductCache;
    const { svc, saved } = build([[product()]], {}, [shopifyRow]);
    await svc.syncProducts(5);
    expect(saved.find((p) => p.handle === 'vita-c-serum')).toBeUndefined();
  });

  it('marks a hidden or unsold product archived', async () => {
    const { svc, saved } = build([[product({ display: 'F' })]]);
    await svc.syncProducts(5);
    expect(saved[0].status).toBe('archived');
  });

  it('reports the mall as not connected instead of throwing', async () => {
    const { svc, tokenService } = build([]);
    (tokenService.getConnection as jest.Mock).mockResolvedValue(null);
    const res = await svc.syncProducts(5);
    expect(res).toMatchObject({ ok: false, synced: 0 });
    expect(res.detail).toContain('not connected');
  });

  it('does not count a product whose row failed to save', async () => {
    // The summary has to describe the database, not the attempt.
    const { svc, productRepo } = build([[product()]]);
    (productRepo.save as jest.Mock).mockRejectedValueOnce(new Error('deadlock'));
    const res = await svc.syncProducts(5);
    expect(res).toMatchObject({ ok: false, synced: 0, archived: 0 });
  });

  it('enriches a product whose only text is a short line, not just an empty one', async () => {
    const fetchProduct = jest.fn(async () => ({
      description: `<p>${'상세 설명 텍스트입니다. '.repeat(10)}</p>`,
    }));
    const { svc, saved, client } = build(
      [[product({ description: null, simple_description: '리무버' })]],
      { fetchProduct },
    );
    await svc.syncProducts(5);
    expect(client.fetchProduct).toHaveBeenCalled();
    expect(saved[0].description).toContain('상세 설명 텍스트입니다.');
  });

  it('resolves host-relative and protocol-relative image paths against the storefront', async () => {
    const { svc, saved } = build([[product({ detail_image: '/web/product/big/floria.jpg' })]]);
    await svc.syncProducts(5);
    expect(saved[0].imageUrl).toBe('https://amoebaorder.cafe24.com/web/product/big/floria.jpg');
  });

  it('advances since_product_no on every page once it crosses the offset cap', async () => {
    // Pinning since_product_no while offset creeps forward re-requests the same
    // page until the page cap — 100 wasted calls returning nothing new.
    const page = (start: number) =>
      Array.from({ length: 100 }, (_, i) => product({ product_no: start + i }));
    const pages = [...Array(82)].map((_, p) => page(p * 100 + 1));
    const { svc, client } = build([...pages, []]);

    await svc.syncProducts(5);

    const calls = (client.pullProducts as jest.Mock).mock.calls.map((c) => c[2]);
    const bySince = calls.filter((o) => o.sinceProductNo != null);
    expect(bySince.length).toBeGreaterThan(1);
    // Each since-paged call resumes past the previous page's last product.
    expect(new Set(bySince.map((o) => o.sinceProductNo)).size).toBe(bySince.length);
  });

  it('keeps paging until a short page and does not double-count a repeated product', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => product({ product_no: i + 1 }));
    const { svc } = build([page1, [product({ product_no: 1 })]]);
    const res = await svc.syncProducts(5);
    expect(res.synced).toBe(100); // the repeat is already seen
  });
});
