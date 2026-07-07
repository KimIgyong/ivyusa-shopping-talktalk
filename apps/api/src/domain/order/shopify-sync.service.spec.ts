import { ShopifySyncService } from './shopify-sync.service';
import { OrderCache } from './entity/order-cache.entity';

/** ShopifySyncService.syncOrders — Admin API orders → cache upsert + status mapping. */
describe('ShopifySyncService.syncOrders', () => {
  const sampleOrders = [
    {
      id: 1001,
      order_number: 1001,
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price: '42.00',
      currency: 'USD',
      customer: { id: 5, email: 'a@x.com', first_name: 'A', last_name: 'B' },
    },
    {
      id: 1002,
      order_number: 1002,
      financial_status: 'pending',
      fulfillment_status: null,
      total_price: '10.00',
      currency: 'USD',
      email: 'c@x.com',
      customer: null,
    },
  ];

  function build(orders: unknown[], conn: unknown = { shopDomain: 's.myshopify.com', token: 't' }) {
    const saved: OrderCache[] = [];
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: Partial<OrderCache>) => ({ ...x }) as OrderCache),
      save: jest.fn((x: OrderCache) => {
        saved.push(x);
        return Promise.resolve(x);
      }),
    };
    const client = { fetchOrders: jest.fn().mockResolvedValue(orders) };
    const tenantService = { getShopifyConnection: jest.fn().mockResolvedValue(conn) };
    const customerService = { findOrCreateByEmail: jest.fn().mockResolvedValue({ id: 42 }) };
    const integrationService = { upsert: jest.fn().mockResolvedValue(undefined) };
    const svc = new ShopifySyncService(
      orderRepo as never,
      client as never,
      tenantService as never,
      customerService as never,
      integrationService as never,
    );
    return { svc, saved, orderRepo, client, customerService, integrationService };
  }

  it('upserts each order with mapped status and links customers', async () => {
    const { svc, saved, customerService, integrationService } = build(sampleOrders);
    const res = await svc.syncOrders(7);

    expect(res).toEqual({ ok: true, synced: 2, detail: 'Synced 2 order(s)' });
    expect(saved).toHaveLength(2);

    // Order 1001: fulfilled → shipping; customer resolved by email with full name + shopify id.
    expect(saved[0]).toMatchObject({
      shopifyOrderId: '1001',
      orderNumber: '1001',
      statusInternal: 'shipping',
      total: 42,
      currency: 'USD',
      customerId: 42,
      tenantId: 7,
    });
    expect(customerService.findOrCreateByEmail).toHaveBeenCalledWith(7, 'a@x.com', 'A B', '5');

    // Order 1002: paid=pending & unfulfilled → paid; email falls back to order.email, no customer obj.
    expect(saved[1]).toMatchObject({ shopifyOrderId: '1002', statusInternal: 'paid' });
    expect(customerService.findOrCreateByEmail).toHaveBeenCalledWith(7, 'c@x.com', undefined, undefined);

    expect(integrationService.upsert).toHaveBeenCalledWith('shopify', 'connected', 'Synced 2 order(s)');
  });

  it('maps a paid, unfulfilled order to "preparing"', async () => {
    const { svc, saved } = build([
      { id: 1, order_number: 1, financial_status: 'paid', fulfillment_status: null },
    ]);
    await svc.syncOrders(1);
    expect(saved[0].statusInternal).toBe('preparing');
  });

  it('records an error and syncs nothing when the connection is missing', async () => {
    const { svc, integrationService, client } = build([], null);
    const res = await svc.syncOrders(1);
    expect(res.ok).toBe(false);
    expect(res.synced).toBe(0);
    expect(res.detail).toMatch(/reconnect the store/);
    expect(client.fetchOrders).not.toHaveBeenCalled();
    expect(integrationService.upsert).toHaveBeenCalledWith('shopify', 'error', expect.any(String));
  });

  it('records an error when the Admin API call fails', async () => {
    const { svc, integrationService } = build(sampleOrders);
    // Force the client to throw.
    (svc as unknown as { client: { fetchOrders: jest.Mock } }).client.fetchOrders = jest
      .fn()
      .mockRejectedValue(new Error('Admin API returned 401'));
    const res = await svc.syncOrders(1);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('401');
    expect(integrationService.upsert).toHaveBeenCalledWith('shopify', 'error', expect.stringContaining('401'));
  });
});
