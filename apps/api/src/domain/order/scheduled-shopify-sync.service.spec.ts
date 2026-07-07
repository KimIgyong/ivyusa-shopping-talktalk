import { ScheduledShopifySyncService } from './scheduled-shopify-sync.service';

/** ScheduledShopifySyncService.runAll — per-tenant fan-out with error isolation. */
describe('ScheduledShopifySyncService.runAll', () => {
  function build(tenantIds: number[]) {
    const tenantService = { listShopifyTenantIds: jest.fn().mockResolvedValue(tenantIds) };
    const syncService = { syncOrders: jest.fn().mockResolvedValue({ ok: true, synced: 1, detail: 'ok' }) };
    const svc = new ScheduledShopifySyncService(tenantService as never, syncService as never);
    return { svc, tenantService, syncService };
  }

  it('syncs every tenant that has a Shopify credential', async () => {
    const { svc, syncService } = build([1, 2, 3]);
    await svc.runAll();
    expect(syncService.syncOrders).toHaveBeenCalledTimes(3);
    expect(syncService.syncOrders).toHaveBeenCalledWith(2);
  });

  it('isolates a per-tenant failure and continues', async () => {
    const { svc, syncService } = build([1, 2]);
    syncService.syncOrders.mockRejectedValueOnce(new Error('boom'));
    await svc.runAll();
    expect(syncService.syncOrders).toHaveBeenCalledTimes(2); // 2nd still ran
  });

  it('skips overlapping runs', async () => {
    const { svc, tenantService, syncService } = build([1]);
    let resolveSync: () => void = () => {};
    syncService.syncOrders.mockImplementationOnce(
      () => new Promise((r) => { resolveSync = () => r({ ok: true, synced: 0, detail: '' }); }),
    );
    const first = svc.runAll(); // starts, hangs on tenant 1
    await svc.runAll(); // should early-return (running)
    expect(tenantService.listShopifyTenantIds).toHaveBeenCalledTimes(1);
    resolveSync();
    await first;
  });
});
