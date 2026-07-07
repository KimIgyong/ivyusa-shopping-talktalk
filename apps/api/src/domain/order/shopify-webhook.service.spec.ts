import { ShopifyWebhookService } from './shopify-webhook.service';

/** ShopifyWebhookService — tenant resolution + fulfillment status mapping. */
describe('ShopifyWebhookService', () => {
  function build(opts: { tenant?: unknown; order?: unknown } = {}) {
    const orderRepo = { findOne: jest.fn().mockResolvedValue(opts.order ?? null) };
    const tenantService = {
      findByShopDomain: jest.fn().mockResolvedValue(opts.tenant ?? null),
    };
    const syncService = { upsertOrder: jest.fn().mockResolvedValue(undefined) };
    const orderService = { handleFulfillmentWebhook: jest.fn().mockResolvedValue(undefined) };
    const svc = new ShopifyWebhookService(
      orderRepo as never,
      tenantService as never,
      syncService as never,
      orderService as never,
    );
    return { svc, syncService, orderService, orderRepo };
  }

  it('ignores an order webhook for an unknown shop', async () => {
    const { svc, syncService } = build({ tenant: null });
    await svc.handleOrderUpsert('nope.myshopify.com', { id: 1 });
    expect(syncService.upsertOrder).not.toHaveBeenCalled();
  });

  it('upserts an order for a known shop', async () => {
    const { svc, syncService } = build({ tenant: { id: 7 } });
    await svc.handleOrderUpsert('ivyusa.myshopify.com', { id: 1, order_number: 5 });
    expect(syncService.upsertOrder).toHaveBeenCalledWith(7, { id: 1, order_number: 5 });
  });

  it('advances a cached order to the mapped fulfillment status', async () => {
    const cases: Array<[string | null, string]> = [
      ['delivered', 'delivered'],
      ['in_transit', 'in_transit'],
      ['out_for_delivery', 'in_transit'],
      [null, 'shipped'],
    ];
    for (const [shipment, expected] of cases) {
      const { svc, orderService } = build({ tenant: { id: 7 }, order: { id: 42 } });
      await svc.handleFulfillment('ivyusa.myshopify.com', {
        order_id: 900001,
        shipment_status: shipment,
        tracking_number: 'TN1',
        tracking_company: 'UPS',
      });
      expect(orderService.handleFulfillmentWebhook).toHaveBeenCalledWith(42, expected, 'TN1', 'UPS');
    }
  });

  it('ignores a fulfillment for an uncached order', async () => {
    const { svc, orderService } = build({ tenant: { id: 7 }, order: null });
    await svc.handleFulfillment('ivyusa.myshopify.com', { order_id: 900001, shipment_status: 'delivered' });
    expect(orderService.handleFulfillmentWebhook).not.toHaveBeenCalled();
  });
});
