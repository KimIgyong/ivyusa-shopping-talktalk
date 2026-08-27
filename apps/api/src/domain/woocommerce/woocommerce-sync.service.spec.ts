import { WooProductSyncService } from './woocommerce-product-sync.service';
import { WooSyncService } from './woocommerce-sync.service';
import { WooProduct, WooOrder } from './woocommerce.client';
import { ProductCache } from '../product/entity/product-cache.entity';
import { OrderCache } from '../order/entity/order-cache.entity';

const CONFIG = { store_url: 'https://shop.example.com', consumer_key: 'ck', consumer_secret: 'cs' };

beforeAll(() => {
  jest
    .spyOn(require('../ecommerce/provider-config.util'), 'parseProviderConfig')
    .mockImplementation((...args: unknown[]) => (args[0] ? CONFIG : null));
});
afterAll(() => jest.restoreAllMocks());

describe('WooProductSyncService', () => {
  function build(products: WooProduct[]) {
    const saved: ProductCache[] = [];
    let nextId = 100;
    const productRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: (p: Partial<ProductCache>) => p as ProductCache,
      save: jest.fn(async (p: ProductCache) => { const w = p.id != null ? p : ({ ...p, id: nextId++ } as ProductCache); saved.push(w); return w; }),
    };
    const credRepo = { findOne: jest.fn().mockResolvedValue({ secretEnc: Buffer.from('x') }) };
    const client = {
      storeCurrency: jest.fn().mockResolvedValue('USD'),
      pullProducts: jest.fn(async (_c: unknown, o: { page: number }) => (o.page === 1 ? products : [])),
    };
    const svc = new WooProductSyncService(productRepo as never, credRepo as never, client as never, { upsert: jest.fn() } as never);
    return { svc, saved };
  }

  it('maps a Woo product onto the cache row', async () => {
    const p: WooProduct = {
      id: 42, name: 'Blue Mug', sku: 'MUG-01', permalink: 'https://shop.example.com/product/blue-mug',
      price: '12.50', short_description: '<p>A mug</p>', status: 'publish', date_created: '2026-08-01T00:00:00',
      images: [{ src: 'https://cdn/mug.jpg' }], categories: [{ name: 'Kitchen' }], tags: [{ name: 'gift' }],
    };
    const { svc, saved } = build([p]);
    const res = await svc.syncProducts(3);
    expect(res.synced).toBe(1);
    const row = saved.find((r) => r.handle === 'woo-42')!;
    expect(row.title).toBe('Blue Mug');
    expect(row.price).toBe(12.5);
    expect(row.currency).toBe('USD');
    expect(row.category).toBe('Kitchen');
    expect(row.tags).toBe('Kitchen, gift');
    expect(row.imageUrl).toBe('https://cdn/mug.jpg');
    expect(row.productUrl).toBe('https://shop.example.com/product/blue-mug');
    expect(row.status).toBe('active');
  });
});

describe('WooSyncService', () => {
  const order = (over: Partial<WooOrder> = {}): WooOrder => ({
    id: 555, number: '555', status: 'processing', total: '99.00', currency: 'USD',
    date_created: '2026-08-20T00:00:00', customer_id: 7,
    billing: { email: 'buyer@shop.com', first_name: 'C', last_name: 'D' },
    line_items: [{ name: 'Blue Mug', quantity: 3, total: '37.50', product_id: 42 }],
    ...over,
  });

  function build(orders: WooOrder[]) {
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
    const customerService = { findOrCreateByEmail: jest.fn(async (_t: number, e: string) => { created.push(e); return { id: 800 }; }) };
    const svc = new WooSyncService(orderRepo as never, itemRepo as never, credRepo as never, client as never, customerService as never, { upsert: jest.fn() } as never);
    return { svc, saved, items, created };
  }

  it('maps a processing order → paid, links buyer + items', async () => {
    const { svc, saved, items, created } = build([order()]);
    const res = await svc.syncOrders(3);
    expect(res.synced).toBe(1);
    const row = saved.find((o) => o.shopifyOrderId === '555')!;
    expect(row.provider).toBe('woocommerce');
    expect(row.statusInternal).toBe('paid');
    expect(row.total).toBe(99);
    expect(row.customerId).toBe(800);
    expect(row.memberId).toBe('woo-7');
    expect(created).toEqual(['buyer@shop.com']);
    expect(items).toHaveLength(1);
  });

  it('maps status: completed→delivered, cancelled→cancel_requested, on-hold→pending_payment', async () => {
    const { svc, saved } = build([
      order({ id: 1, status: 'completed' }),
      order({ id: 2, status: 'cancelled' }),
      order({ id: 3, status: 'on-hold' }),
    ]);
    await svc.syncOrders(3);
    expect(saved.find((o) => o.shopifyOrderId === '1')!.statusInternal).toBe('delivered');
    expect(saved.find((o) => o.shopifyOrderId === '2')!.statusInternal).toBe('cancel_requested');
    expect(saved.find((o) => o.shopifyOrderId === '3')!.statusInternal).toBe('pending_payment');
  });
});
