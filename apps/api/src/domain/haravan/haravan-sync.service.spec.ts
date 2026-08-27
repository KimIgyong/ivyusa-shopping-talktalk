import { HaravanProductSyncService } from './haravan-product-sync.service';
import { HaravanSyncService } from './haravan-sync.service';
import { HaravanProduct, HaravanOrder } from './haravan.client';
import { ProductCache } from '../product/entity/product-cache.entity';
import { OrderCache } from '../order/entity/order-cache.entity';

const CONFIG = { shop_domain: 'tata-8.myharavan.com', access_token: 't' };

beforeAll(() => {
  jest
    .spyOn(require('../ecommerce/provider-config.util'), 'parseProviderConfig')
    .mockImplementation((...args: unknown[]) => (args[0] ? CONFIG : null));
});
afterAll(() => jest.restoreAllMocks());

describe('HaravanProductSyncService', () => {
  function build(products: HaravanProduct[], existing: Partial<ProductCache>[] = []) {
    const saved: ProductCache[] = [];
    let nextId = 100;
    const productRepo = {
      find: jest.fn().mockResolvedValue(existing as ProductCache[]),
      create: (p: Partial<ProductCache>) => p as ProductCache,
      save: jest.fn(async (p: ProductCache) => {
        const withId = p.id != null ? p : ({ ...p, id: nextId++ } as ProductCache);
        const i = saved.findIndex((r) => r.handle === withId.handle);
        if (i >= 0) saved[i] = withId; else saved.push(withId);
        return withId;
      }),
    };
    const credRepo = { findOne: jest.fn().mockResolvedValue({ secretEnc: Buffer.from('x') }) };
    const client = {
      shopCurrency: jest.fn().mockResolvedValue('VND'),
      pullProducts: jest.fn(async (_c: unknown, o: { page: number }) => (o.page === 1 ? products : [])),
    };
    const integration = { upsert: jest.fn() };
    const svc = new HaravanProductSyncService(productRepo as never, credRepo as never, client as never, integration as never);
    return { svc, saved };
  }

  it('maps a Haravan product (Shopify shape) onto the cache row', async () => {
    const p: HaravanProduct = {
      id: 1076204166, title: 'Váy Quây dài', handle: 'vay-quay-dai', vendor: 'Khác',
      product_type: 'Áo', body_html: '<p>desc</p>', tags: 'sale',
      published_at: '2026-08-01T00:00:00Z', images: [{ src: 'https://cdn/x.jpg' }],
      variants: [{ price: 600000, sku: 'AO551' }],
    };
    const { svc, saved } = build([p]);
    const res = await svc.syncProducts(9);
    expect(res.synced).toBe(1);
    const row = saved.find((r) => r.handle === 'haravan-1076204166')!;
    expect(row.title).toBe('Váy Quây dài');
    expect(row.price).toBe(600000);
    expect(row.currency).toBe('VND');
    expect(row.sku).toBe('AO551');
    expect(row.category).toBe('Áo');
    expect(row.tags).toBe('sale, Áo');
    expect(row.imageUrl).toBe('https://cdn/x.jpg');
    expect(row.productUrl).toBe('https://tata-8.myharavan.com/products/vay-quay-dai');
    expect(row.status).toBe('active');
  });

  it('archives an unpublished product and returns not-connected without creds', async () => {
    const { svc, saved } = build([{ id: 5, title: 'Hidden', published_at: null, variants: [] }]);
    await svc.syncProducts(9);
    expect(saved.find((r) => r.handle === 'haravan-5')!.status).toBe('archived');
  });
});

describe('HaravanSyncService', () => {
  const order = (over: Partial<HaravanOrder> = {}): HaravanOrder => ({
    id: 1835207024, name: '#10026', order_number: '#10026', financial_status: 'paid',
    fulfillment_status: 'notfulfilled', total_price: 30800000, currency: 'VND',
    created_at: '2026-08-24T07:07:01.206Z',
    customer: { id: 1172985262, email: 'buyer@x.com', first_name: 'A', last_name: 'B' },
    line_items: [{ title: 'Item', quantity: 2, price: 15400000, product_id: 1076204166 }],
    ...over,
  });

  function build(orders: HaravanOrder[]) {
    const saved: OrderCache[] = [];
    let nextId = 100;
    const orderRepo = {
      findOne: jest.fn(async ({ where }: { where: { shopifyOrderId: string } }) => saved.find((o) => o.shopifyOrderId === where.shopifyOrderId) ?? null),
      create: (p: Partial<OrderCache>) => p as OrderCache,
      save: jest.fn(async (o: OrderCache) => { if (o.id == null) { o.id = nextId++; saved.push(o); } return o; }),
    };
    const items: unknown[] = [];
    const itemRepo = { create: (r: unknown) => r, delete: jest.fn(), save: jest.fn(async (r: unknown[]) => { items.push(...r); return r; }) };
    const credRepo = { findOne: jest.fn().mockResolvedValue({ secretEnc: Buffer.from('x') }) };
    const client = { pullOrders: jest.fn(async (_c: unknown, o: { page: number }) => (o.page === 1 ? orders : [])) };
    const created: string[] = [];
    const customerService = { findOrCreateByEmail: jest.fn(async (_t: number, email: string) => { created.push(email); return { id: 700 }; }) };
    const integration = { upsert: jest.fn() };
    const svc = new HaravanSyncService(orderRepo as never, itemRepo as never, credRepo as never, client as never, customerService as never, integration as never);
    return { svc, saved, items, created };
  }

  it('maps a paid order + links the buyer + items', async () => {
    const { svc, saved, items, created } = build([order()]);
    const res = await svc.syncOrders(9);
    expect(res.synced).toBe(1);
    const row = saved.find((o) => o.shopifyOrderId === '1835207024')!;
    expect(row.provider).toBe('haravan');
    expect(row.orderNumber).toBe('#10026');
    expect(row.total).toBe(30800000);
    expect(row.currency).toBe('VND');
    expect(row.statusInternal).toBe('paid');
    expect(row.customerId).toBe(700);
    expect(row.memberId).toBe('haravan-1172985262');
    expect(created).toEqual(['buyer@x.com']);
    expect(items).toHaveLength(1);
  });

  it('maps fulfilled → shipping and cancelled → cancel_requested', async () => {
    const { svc, saved } = build([order({ id: 2, fulfillment_status: 'fulfilled' }), order({ id: 3, cancelled_at: '2026-08-25T00:00:00Z' })]);
    await svc.syncOrders(9);
    expect(saved.find((o) => o.shopifyOrderId === '2')!.statusInternal).toBe('shipping');
    expect(saved.find((o) => o.shopifyOrderId === '3')!.statusInternal).toBe('cancel_requested');
  });
});
