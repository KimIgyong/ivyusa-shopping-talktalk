import { OdooProductSyncService } from './odoo-product-sync.service';
import { OdooProduct } from './odoo.client';
import { ProductCache } from '../product/entity/product-cache.entity';

/**
 * Odoo catalogue → products_cache (REQ-260826, W2). Verifies the W0-confirmed
 * field mapping, handle prefix, image/URL construction, and the archive pass.
 * The credential is injected pre-decrypted via a fake credRepo row.
 */
describe('OdooProductSyncService.syncProducts', () => {
  const CONFIG = { url: 'https://gif2box.vn/', db: 'gif2box', username: 'admin', api_key: 'k' };

  const product = (over: Partial<OdooProduct> = {}): OdooProduct => ({
    id: 544,
    name: '1 Gói Khăn Ướt Cao Cấp',
    list_price: 91667,
    default_code: 'GIFT_KHANUOT_202600003',
    categ_id: [1184, 'Mom & Baby / Bath & Body Care / Wipes'],
    website_url: '/shop/gift-khanuot-544',
    description_sale: false,
    ...over,
  });

  function build(pages: OdooProduct[][], existing: Partial<ProductCache>[] = []) {
    const saved: ProductCache[] = [];
    let nextId = 100;
    const productRepo = {
      find: jest.fn().mockResolvedValue(existing as ProductCache[]),
      create: (p: Partial<ProductCache>) => p as ProductCache,
      save: jest.fn(async (p: ProductCache) => {
        const withId = p.id != null ? p : ({ ...p, id: nextId++ } as ProductCache);
        const i = saved.findIndex((r) => r.handle === withId.handle);
        if (i >= 0) saved[i] = withId;
        else saved.push(withId);
        return withId;
      }),
    };
    // Pre-decrypted credential: decryptSecret is bypassed because secretEnc is a
    // Buffer of the plain JSON and crypto.util would fail — instead we stub the
    // repo to return a row and mock getConfig via the client path. Simpler: give
    // secretEnc as the plain JSON bytes and mock decryptSecret? We instead inject
    // a credRepo returning a row and rely on the service reading JSON — so encode
    // the config as the "decrypted" value by mocking decryptSecret.
    const credRepo = { findOne: jest.fn().mockResolvedValue({ secretEnc: Buffer.from('x') }) };
    let call = 0;
    const client = {
      authenticate: jest.fn().mockResolvedValue(2),
      companyCurrency: jest.fn().mockResolvedValue('VND'),
      pullProducts: jest.fn(async () => pages[call++] ?? []),
    };
    const integration = { upsert: jest.fn().mockResolvedValue(undefined) };
    const svc = new OdooProductSyncService(
      productRepo as never,
      credRepo as never,
      client as never,
      integration as never,
    );
    return { svc, saved, productRepo, client, integration };
  }

  // decryptSecret returns our config JSON regardless of the stub buffer.
  beforeAll(() => {
    jest
      .spyOn(require('../../global/util/crypto.util'), 'decryptSecret')
      .mockImplementation(() => JSON.stringify(CONFIG));
  });
  afterAll(() => jest.restoreAllMocks());

  it('maps Odoo fields onto the cache row (handle, price, image, url, category, currency)', async () => {
    const { svc, saved, integration } = build([[product()], []]);
    const res = await svc.syncProducts(6);

    expect(res.ok).toBe(true);
    expect(res.synced).toBe(1);
    const row = saved.find((r) => r.handle === 'odoo-544')!;
    expect(row).toBeTruthy();
    expect(row.title).toBe('1 Gói Khăn Ướt Cao Cấp');
    expect(row.price).toBe(91667);
    expect(row.currency).toBe('VND');
    expect(row.sku).toBe('GIFT_KHANUOT_202600003');
    // category = last path segment; tags = full path (keeps thin-desc products reachable)
    expect(row.category).toBe('Wipes');
    expect(row.tags).toBe('Mom & Baby / Bath & Body Care / Wipes');
    // image never pulls bytes — it's the stable web-image route
    expect(row.imageUrl).toBe('https://gif2box.vn/web/image/product.template/544/image_1920');
    // product URL is the odoo base + website path (no double slash from trailing /)
    expect(row.productUrl).toBe('https://gif2box.vn/shop/gift-khanuot-544');
    expect(row.status).toBe('active');
    expect(integration.upsert).toHaveBeenCalledWith('odoo', 'connected', expect.stringContaining('Synced 1'));
  });

  it('falls back to {base}/shop when a product has no website_url', async () => {
    const { svc, saved } = build([[product({ id: 7, website_url: false })], []]);
    await svc.syncProducts(6);
    expect(saved.find((r) => r.handle === 'odoo-7')!.productUrl).toBe('https://gif2box.vn/shop');
  });

  it('pages until a short page and archives handles it no longer sees', async () => {
    const full = Array.from({ length: 200 }, (_, i) => product({ id: i + 1, website_url: false }));
    const existing = [
      { id: 1, handle: 'odoo-999', status: 'active' }, // owned, now missing → archived
      { id: 2, handle: 'shopify-1', status: 'active' }, // other source → untouched
    ];
    const { svc, saved } = build([full, []], existing);
    const res = await svc.syncProducts(6);

    expect(res.synced).toBe(200);
    expect(res.archived).toBe(1);
    expect(saved.find((r) => r.handle === 'odoo-999')!.status).toBe('archived');
    expect(saved.find((r) => r.handle === 'shopify-1')).toBeUndefined(); // never touched
  });

  it('returns not-connected when the credential is missing', async () => {
    const { svc } = build([[]]);
    (svc as unknown as { credRepo: { findOne: jest.Mock } }).credRepo.findOne.mockResolvedValueOnce(null);
    const res = await svc.syncProducts(6);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('not connected');
  });
});
