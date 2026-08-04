import { randomBytes } from 'crypto';
import { OrderService } from './order.service';

/**
 * OrderService.guestLookup — the number that reaches the query.
 *
 * Reproduced against the running API before the fix: `1002` found the order while
 * `#1002` and `" 1002 "` both returned 404, because the query compared the shopper's
 * raw input to the canonical number ingest had stored. Every surface a shopper reads
 * the number from — the widget, Shopify's confirmation email, the admin — prints the
 * '#', so the form rejected exactly what people type.
 */
describe('OrderService.guestLookup', () => {
  // The email is matched on its HMAC blind index (PRV-M6), which needs a key. Any
  // 32-byte key works — these suites assert the order number, not the hash.
  beforeAll(() => {
    process.env.CRED_ENC_KEY = randomBytes(32).toString('base64');
  });

  function build(foundOrder: unknown = { id: 4, customerId: 6, orderNumber: '1002' }) {
    const params: Record<string, unknown> = {};
    // Self-returning builder: records every parameter the query is given.
    const qb: Record<string, unknown> = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'getOne') return async () => foundOrder;
          return (...args: unknown[]) => {
            const bag = args[1] ?? args[0];
            if (bag && typeof bag === 'object') Object.assign(params, bag);
            return qb;
          };
        },
      },
    );

    const session = { sessionToken: 'tok', tenantId: 2, customerId: null as number | null };
    const svc = new OrderService(
      { createQueryBuilder: () => qb } as never, // orderRepo
      {} as never, // itemRepo
      {} as never, // fulfillRepo
      { findOne: async () => session, save: jest.fn(async (s: unknown) => s) } as never, // sessionRepo
      {} as never, // customerRepo
      { publish: jest.fn() } as never, // bus
      { incr: jest.fn(async () => 1), set: jest.fn(), del: jest.fn() } as never, // redis
      {} as never, // webhookSecretService
      {} as never, // sessionService
    );
    return { svc, params, session };
  }

  it('looks up the canonical number when the shopper types the # they were shown', async () => {
    const { svc, params } = build();
    await svc.guestLookup('tok', '#1002', 'shopper@example.com');
    expect(params.orderNumber).toBe('1002');
  });

  it('tolerates whitespace from a copy/paste', async () => {
    const { svc, params } = build();
    await svc.guestLookup('tok', '  1002 ', 'shopper@example.com');
    expect(params.orderNumber).toBe('1002');
  });

  it('passes an already-canonical number through unchanged', async () => {
    const { svc, params } = build();
    await svc.guestLookup('tok', '1002', 'shopper@example.com');
    expect(params.orderNumber).toBe('1002');
  });

  it('keeps a store prefix intact', async () => {
    const { svc, params } = build();
    await svc.guestLookup('tok', '#IVY-1001', 'shopper@example.com');
    expect(params.orderNumber).toBe('IVY-1001');
  });

  it('binds the session to the matched order on success', async () => {
    const { svc, session } = build();
    await svc.guestLookup('tok', '#1002', 'shopper@example.com');
    expect(session.customerId).toBe(6);
  });

  it('still 404s when nothing matches', async () => {
    const { svc } = build(null);
    await expect(svc.guestLookup('tok', '#9999', 'shopper@example.com')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses a session with no tenant rather than guessing (SEC-H2)', async () => {
    const { svc, session } = build();
    session.tenantId = null as never;
    await expect(svc.guestLookup('tok', '1002', 'shopper@example.com')).rejects.toMatchObject({
      status: 400,
    });
  });
});
