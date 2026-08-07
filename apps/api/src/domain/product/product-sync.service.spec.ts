import { ProductSyncService, stripHtml } from './product-sync.service';
import { ProductCache } from './entity/product-cache.entity';
import { Tenant } from '../tenant/entity/tenant.entity';

/** ProductSyncService — storefront /products.json → products_cache (PLN-260807 F1). */
describe('ProductSyncService.syncTenant', () => {
  const tenant = {
    id: 7,
    shopDomain: 'ivy.myshopify.com',
    storefrontUrl: 'https://ivyusa.com/',
  } as Tenant;

  const product = (over: Record<string, unknown> = {}) => ({
    id: 1,
    title: 'Vita C Serum',
    handle: 'vita-c-serum',
    body_html: '<p>Bright &amp; <b>glowy</b> skin</p>',
    published_at: '2026-08-01T00:00:00.000Z',
    vendor: 'IVY',
    product_type: 'Serum',
    tags: ['vitamin', 'glow'],
    variants: [{ price: '25.00' }, { price: '99.00', sku: 'IVY-VITC-2' }],
    images: [{ src: 'https://cdn.shopify.com/serum.jpg' }],
    ...over,
  });

  /** Sequential page bodies; anything can also be a raw response override. */
  function mockFetch(pages: Array<unknown[] | { status?: number; url?: string; body?: unknown }>) {
    let call = 0;
    const fn = jest.fn(async () => {
      const page = pages[call++];
      if (Array.isArray(page) || page === undefined) {
        return {
          status: 200,
          url: 'https://ivyusa.com/products.json',
          json: async () => ({ products: page ?? [] }),
        };
      }
      return {
        status: page.status ?? 200,
        url: page.url ?? 'https://ivyusa.com/products.json',
        json: async () => {
          if (page.body === 'not-json') throw new Error('invalid json');
          return page.body;
        },
      };
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  function build(existing: Partial<ProductCache>[] = []) {
    const saved: ProductCache[] = [];
    let nextId = 100;
    const productRepo = {
      find: jest.fn().mockResolvedValue(existing as ProductCache[]),
      count: jest.fn().mockResolvedValue(existing.length),
      create: (p: Partial<ProductCache>) => p as ProductCache,
      save: jest.fn(async (p: ProductCache) => {
        const withId = p.id != null ? p : ({ ...p, id: nextId++ } as ProductCache);
        saved.push({ ...withId });
        return withId;
      }),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const tenantRepo = {
      find: jest.fn().mockResolvedValue([tenant]),
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const svc = new ProductSyncService(productRepo as never, tenantRepo as never);
    return { svc, saved, productRepo, tenantRepo };
  }

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
  });

  it('maps a storefront product onto the cache row (array tags, html strip, first-variant price)', async () => {
    const fetchMock = mockFetch([[product()]]);
    const { svc, saved } = build();

    const res = await svc.syncTenant(tenant);

    expect(res).toMatchObject({ ok: true, synced: 1, archived: 0 });
    // Trailing slash trimmed off the storefront origin.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ivyusa.com/products.json?limit=250&page=1',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
    expect(saved[0]).toMatchObject({
      tenantId: 7,
      handle: 'vita-c-serum',
      title: 'Vita C Serum',
      vendor: 'IVY',
      category: 'Serum',
      tags: 'vitamin, glow',
      description: "Bright & glowy skin",
      price: 25,
      sku: 'IVY-VITC-2',
      imageUrl: 'https://cdn.shopify.com/serum.jpg',
      productUrl: 'https://ivyusa.com/products/vita-c-serum',
      status: 'active',
    });
    expect(saved[0].publishedAt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(saved[0].syncedAt).toBeInstanceOf(Date);
  });

  it('takes the first NON-EMPTY variant sku, not variants[0]', async () => {
    // A placeholder first variant ("Default Title", no code) is common; taking
    // position 0 would drop the real SKU sitting on the next variant.
    mockFetch([[product({ variants: [{ price: '9.00', sku: '  ' }, { price: '9.00', sku: 'REAL-1' }] })]]);
    const { svc, saved } = build();
    await svc.syncTenant(tenant);
    expect(saved[0].sku).toBe('REAL-1');
  });

  it('nulls sku when no variant carries one (29 of 2,275 live products)', async () => {
    mockFetch([[product({ variants: [{ price: '9.00' }, { price: '9.00', sku: null }] })]]);
    const { svc, saved } = build();
    await svc.syncTenant(tenant);
    expect(saved[0].sku).toBeNull();
  });

  it('caps an over-long sku at the column width', async () => {
    mockFetch([[product({ variants: [{ price: '9.00', sku: 'S'.repeat(80) }] })]]);
    const { svc, saved } = build();
    await svc.syncTenant(tenant);
    expect(saved[0].sku).toHaveLength(64);
  });

  it('accepts tags as a comma string and nulls out missing price/image', async () => {
    mockFetch([[product({ tags: 'mask, collagen', variants: [], images: [] })]]);
    const { svc, saved } = build();
    await svc.syncTenant(tenant);
    expect(saved[0]).toMatchObject({ tags: 'mask, collagen', price: null, imageUrl: null });
  });

  it('falls back to https://<shopDomain> when storefront_url is unset', async () => {
    const fetchMock = mockFetch([[]]);
    const { svc } = build();
    await svc.syncTenant({ ...tenant, storefrontUrl: null } as Tenant);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ivy.myshopify.com/products.json?limit=250&page=1',
      expect.anything(),
    );
  });

  it('pages until a short page, then archives rows the run no longer saw', async () => {
    const fullPage = Array.from({ length: 250 }, (_, i) => product({ id: i, handle: `p-${i}` }));
    const fetchMock = mockFetch([fullPage, [product({ handle: 'last-one' })]]);
    const { svc, saved } = build([
      { id: 9, tenantId: 7, handle: 'gone-product', status: 'active' },
      { id: 10, tenantId: 7, handle: 'p-0', status: 'active' },
    ]);

    const res = await svc.syncTenant(tenant);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://ivyusa.com/products.json?limit=250&page=2',
      expect.anything(),
    );
    expect(res).toMatchObject({ ok: true, synced: 251, archived: 1 });
    const archived = saved.filter((p) => p.status === 'archived');
    expect(archived.map((p) => p.handle)).toEqual(['gone-product']);
    // The seen existing row was updated in place, not archived.
    expect(saved.find((p) => p.handle === 'p-0')?.status).toBe('active');
  });

  it('aborts on a non-200 page, keeping earlier upserts and archiving NOTHING', async () => {
    const fullPage = Array.from({ length: 250 }, (_, i) => product({ id: i, handle: `p-${i}` }));
    mockFetch([fullPage, { status: 500 }]);
    const { svc, saved } = build([{ id: 9, tenantId: 7, handle: 'gone-product', status: 'active' }]);

    const res = await svc.syncTenant(tenant);

    expect(res.ok).toBe(false);
    expect(res.synced).toBe(250);
    expect(res.detail).toContain('HTTP 500');
    // An incomplete run must never blank the catalog.
    expect(saved.some((p) => p.status === 'archived')).toBe(false);
  });

  it('aborts on a password-page redirect without archiving', async () => {
    mockFetch([{ url: 'https://ivyusa.com/password', body: {} }]);
    const { svc, saved } = build([{ id: 9, tenantId: 7, handle: 'kept', status: 'active' }]);
    const res = await svc.syncTenant(tenant);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('password');
    expect(saved).toHaveLength(0);
  });

  it('aborts on a non-JSON response', async () => {
    mockFetch([{ body: 'not-json' }]);
    const { svc } = build();
    const res = await svc.syncTenant(tenant);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('non-JSON');
  });

  it('syncTenantById resolves the tenant, 404s when unknown', async () => {
    mockFetch([[]]);
    const { svc, tenantRepo } = build();
    await svc.syncTenantById(7);
    expect(tenantRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    tenantRepo.findOne.mockResolvedValue(null);
    await expect(svc.syncTenantById(404)).rejects.toThrow();
  });
});

describe('stripHtml', () => {
  it('strips tags, decodes common entities, collapses whitespace', () => {
    expect(stripHtml('<div><p>A &amp; B</p>\n<span> C </span></div>')).toBe('A & B C');
  });

  it('drops script/style bodies entirely', () => {
    expect(stripHtml('<style>.x{color:red}</style><p>Visible</p><script>alert(1)</script>')).toBe('Visible');
  });

  it('returns null for empty or non-string input', () => {
    expect(stripHtml('')).toBeNull();
    expect(stripHtml('<p> </p>')).toBeNull();
    expect(stripHtml(null)).toBeNull();
  });

  it('caps at 2000 chars', () => {
    expect(stripHtml('x'.repeat(3000))?.length).toBe(2000);
  });
});
