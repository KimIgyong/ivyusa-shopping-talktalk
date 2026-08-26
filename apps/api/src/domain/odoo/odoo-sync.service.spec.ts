import { OdooSyncService } from './odoo-sync.service';
import { OdooOrder, OdooOrderLine, OdooPartner } from './odoo.client';
import { OrderCache } from '../order/entity/order-cache.entity';

/**
 * Odoo confirmed orders → orders_cache + order_items (+ email-linked customer)
 * (REQ-260826, W3). Verifies state mapping, buyer linking, line items, the
 * quotation filter is upstream (client), and idempotent upsert.
 */
describe('OdooSyncService.syncOrders', () => {
  const CONFIG = { url: 'https://gif2box.vn', db: 'gif2box', username: 'admin', api_key: 'k' };

  function build(
    pages: OdooOrder[][],
    partners: OdooPartner[],
    lines: OdooOrderLine[],
    existingOrders: Partial<OrderCache>[] = [],
  ) {
    const orders: OrderCache[] = existingOrders.map((o, i) => ({ id: i + 1, ...o }) as OrderCache);
    let nextOrderId = 100;
    const orderRepo = {
      findOne: jest.fn(async ({ where }: { where: { shopifyOrderId: string } }) =>
        orders.find((o) => o.shopifyOrderId === where.shopifyOrderId) ?? null,
      ),
      create: (p: Partial<OrderCache>) => p as OrderCache,
      save: jest.fn(async (o: OrderCache) => {
        if (o.id == null) {
          o.id = nextOrderId++;
          orders.push(o);
        }
        return o;
      }),
    };
    const items: unknown[] = [];
    const itemRepo = {
      create: (r: unknown) => r,
      delete: jest.fn(async () => undefined),
      save: jest.fn(async (rows: unknown[]) => {
        items.push(...rows);
        return rows;
      }),
    };
    const credRepo = { findOne: jest.fn().mockResolvedValue({ secretEnc: Buffer.from('x') }) };
    let call = 0;
    const client = {
      authenticate: jest.fn().mockResolvedValue(2),
      pullOrders: jest.fn(async () => pages[call++] ?? []),
      pullPartners: jest.fn(async () => partners),
      pullOrderLines: jest.fn(async () => lines),
    };
    const created: Array<{ email: string; name?: string }> = [];
    const customerService = {
      findOrCreateByEmail: jest.fn(async (_t: number, email: string, name?: string) => {
        created.push({ email, name });
        return { id: 500 + created.length };
      }),
    };
    const integration = { upsert: jest.fn().mockResolvedValue(undefined) };
    const svc = new OdooSyncService(
      orderRepo as never,
      itemRepo as never,
      credRepo as never,
      client as never,
      customerService as never,
      integration as never,
    );
    return { svc, orders, items, client, customerService, created, integration, orderRepo };
  }

  beforeAll(() => {
    jest
      .spyOn(require('../../global/util/crypto.util'), 'decryptSecret')
      .mockImplementation(() => JSON.stringify(CONFIG));
  });
  afterAll(() => jest.restoreAllMocks());

  const order = (over: Partial<OdooOrder> = {}): OdooOrder => ({
    id: 19,
    name: 'S00019',
    state: 'sale',
    amount_total: 2990001,
    currency_id: [23, 'VND'],
    date_order: '2026-08-25 03:46:12',
    partner_id: [4, 'Nguyen Buyer'],
    ...over,
  });

  it('maps a confirmed order → orders_cache with buyer, currency, status and items', async () => {
    const partners: OdooPartner[] = [{ id: 4, name: 'Nguyen Buyer', email: 'buyer@gif2box.vn' }];
    const lines: OdooOrderLine[] = [
      { id: 1, order_id: [19, 'S00019'], product_id: [544, 'Khan Uot'], name: 'Khan Uot', product_uom_qty: 2, price_unit: 91667 },
      { id: 2, order_id: [19, 'S00019'], product_id: false, name: 'Section', product_uom_qty: 0, price_unit: 0 }, // note line → skipped
    ];
    const { svc, orders, items, created, integration } = build([[order()], []], partners, lines);
    const res = await svc.syncOrders(6);

    expect(res.ok).toBe(true);
    expect(res.synced).toBe(1);
    const row = orders.find((o) => o.shopifyOrderId === '19')!;
    expect(row.provider).toBe('odoo');
    expect(row.orderNumber).toBe('S00019');
    expect(row.total).toBe(2990001);
    expect(row.currency).toBe('VND');
    expect(row.statusInternal).toBe('paid');
    expect(row.statusUi).toBeTruthy();
    expect(row.customerId).toBe(501);
    expect(row.memberId).toBe('odoo-4');
    expect(created).toEqual([{ email: 'buyer@gif2box.vn', name: 'Nguyen Buyer' }]);
    // only the product line becomes an item (the section line is skipped)
    expect(items).toHaveLength(1);
    expect(integration.upsert).toHaveBeenCalledWith('odoo', 'connected', expect.stringContaining('1 order'));
  });

  it('maps a cancelled order to cancel_requested', async () => {
    const { svc, orders } = build([[order({ id: 20, state: 'cancel' })], []], [], []);
    await svc.syncOrders(6);
    expect(orders.find((o) => o.shopifyOrderId === '20')!.statusInternal).toBe('cancel_requested');
  });

  it('syncs a guest order (no email) with no customer link', async () => {
    const partners: OdooPartner[] = [{ id: 4, name: 'Public user', email: false }];
    const { svc, orders, created } = build([[order()], []], partners, []);
    await svc.syncOrders(6);
    expect(orders.find((o) => o.shopifyOrderId === '19')!.customerId).toBeNull();
    expect(created).toEqual([]);
  });

  it('is idempotent — re-syncing updates the existing row, not a duplicate', async () => {
    const existing = [{ id: 7, tenantId: 6, provider: 'odoo', shopifyOrderId: '19', customerId: 999 }];
    const { svc, orders } = build([[order()], []], [{ id: 4, email: false }], [], existing);
    await svc.syncOrders(6);
    const rows = orders.filter((o) => o.shopifyOrderId === '19');
    expect(rows).toHaveLength(1);
    // known customer link is not downgraded to null on a re-pull without email
    expect(rows[0].customerId).toBe(999);
  });

  it('returns not-connected when the credential is missing', async () => {
    const { svc } = build([[]], [], []);
    (svc as unknown as { credRepo: { findOne: jest.Mock } }).credRepo.findOne.mockResolvedValueOnce(null);
    const res = await svc.syncOrders(6);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain('not connected');
  });
});
