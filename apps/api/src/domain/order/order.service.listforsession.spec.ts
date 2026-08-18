import { OrderService } from './order.service';

/**
 * `listForSession` — the query behind the widget's Orders tab
 * (PLN-260818-Widget-Orders-Tab S5).
 */
describe('OrderService.listForSession', () => {
  function build(session: { customerId: number | null; tenantId: number | null }) {
    const wheres: Array<{ clause: string; params: unknown }> = [];
    // `id` is a STRING: TypeORM hands bigint PKs back as strings, and a numeric
    // fixture has hidden a production mismatch here before.
    const row = (id: string, statusInternal: string, statusUi: string) => ({
      id,
      customerId: session.customerId,
      tenantId: session.tenantId,
      orderNumber: `#${id}`,
      statusInternal,
      statusUi,
      total: '32.95',
      currency: 'USD',
      createdAt: new Date('2026-08-10T00:00:00Z'),
      orderedAt: null,
    });
    const orders = [row('1', 'paid', 'Confirmed'), row('2', 'shipping', 'In Transit')];
    const qb: Record<string, unknown> = {
      where: jest.fn((clause: string, params: unknown) => {
        wheres.push({ clause, params });
        return qb;
      }),
      andWhere: jest.fn((clause: string, params: unknown) => {
        wheres.push({ clause, params });
        return qb;
      }),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([orders, orders.length]),
    };
    const orderRepo = { createQueryBuilder: jest.fn(() => qb) };
    const itemRepo = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
      find: jest.fn().mockResolvedValue([]),
    };
    const sessionService = { requireCustomer: jest.fn().mockResolvedValue(session) };

    const svc = new OrderService(
      orderRepo as never,
      itemRepo as never,
      {} as never, // fulfillRepo
      {} as never, // sessionRepo
      {} as never, // customerRepo
      {} as never, // bus
      {} as never, // redis
      {} as never, // webhookSecretService
      sessionService as never,
    );
    return { svc, wheres, orders };
  }

  it('scopes the query by tenant as well as customer', async () => {
    // A customer already belongs to one tenant, so this changes no result today.
    // It is pinned because that assumption is otherwise the only thing standing
    // between a shopper and another tenant's orders (CLAUDE.md §2).
    const { svc, wheres } = build({ customerId: 7, tenantId: 3 });
    await svc.listForSession('tok');

    expect(wheres).toEqual(
      expect.arrayContaining([
        { clause: 'o.customer_id = :customerId', params: { customerId: 7 } },
        { clause: 'o.tenant_id = :tenantId', params: { tenantId: 3 } },
      ]),
    );
  });

  it('still lists when the session carries no tenant, rather than returning nothing', async () => {
    // Legacy sessions predate the tenant binding. Adding an `IS NULL` here would
    // hide every order from them; the customer filter already scopes the read.
    const { svc, wheres } = build({ customerId: 7, tenantId: null });
    const result = await svc.listForSession('tok');

    expect(wheres.some((w) => w.clause.includes('tenant_id'))).toBe(false);
    expect(result.items).toHaveLength(2);
  });

  it('returns every status — a paid order is listed, not filtered out', async () => {
    // The defect this replaces: the widget only ever rendered shipment-ish
    // orders, so a paid-but-unshipped order appeared nowhere
    // (REQ-260818-Widget-Orders-Tab C-3). The server never filtered by status,
    // and it must stay that way for the client fix to hold.
    const { svc, wheres } = build({ customerId: 7, tenantId: 1 });
    const result = await svc.listForSession('tok');

    expect(wheres.some((w) => /status/i.test(w.clause))).toBe(false);
    expect(result.items.map((o) => o.statusInternal)).toEqual(['paid', 'shipping']);
  });

  it('applies the day window only when one is asked for', async () => {
    const { svc, wheres } = build({ customerId: 7, tenantId: 1 });
    await svc.listForSession('tok', undefined, undefined, '90');
    expect(wheres.some((w) => w.clause.includes('DATE_SUB'))).toBe(true);

    const bare = build({ customerId: 7, tenantId: 1 });
    await bare.svc.listForSession('tok');
    expect(bare.wheres.some((w) => w.clause.includes('DATE_SUB'))).toBe(false);
  });

  it('rejects a day window past the API maximum instead of silently clamping', async () => {
    const { svc } = build({ customerId: 7, tenantId: 1 });
    // The widget's Orders tab asks for exactly 90; 91 must fail loudly so a
    // future "let's show a year" change cannot quietly return 90 days.
    await expect(svc.listForSession('tok', undefined, undefined, '91')).rejects.toThrow();
  });
});
