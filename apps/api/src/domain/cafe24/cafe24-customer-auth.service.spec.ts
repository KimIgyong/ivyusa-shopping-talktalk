import { Cafe24CustomerAuthService } from './cafe24-customer-auth.service';
import { BusinessException } from '../../global/exception/business.exception';

/** Minimal stand-ins — only the members the service touches. */
function build() {
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    del: jest.fn(async (k: string) => void store.delete(k)),
  };
  const session = { findOrCreateForCustomer: jest.fn(async () => ({ sessionToken: 'sess-xyz' })) };
  const customer = {
    findOrCreateByCafe24Identifier: jest.fn(async () => ({ id: 42 })),
    adoptCafe24MemberId: jest.fn(async () => undefined),
  };
  const token = { findTenantIdByMallId: jest.fn(async () => 7), getConnection: jest.fn(async () => null) };
  const sync = { syncOrders: jest.fn() };
  const svc = new Cafe24CustomerAuthService(
    redis as never,
    session as never,
    customer as never,
    token as never,
    sync as never,
  );
  return { svc, redis, session, customer, token, store };
}

/** fetch stub: first call = token endpoint, second = identifier endpoint. */
function mockAuthFetch(tokenBody: Record<string, unknown>) {
  return jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => tokenBody })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ identifier: { user_identifier: 'uid-1' } }),
    });
}

describe('Cafe24CustomerAuthService', () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD, CAFE24_CLIENT_ID: 'cid', CAFE24_CLIENT_SECRET: 'csecret' };
  });
  afterAll(() => {
    process.env = OLD;
  });

  it('exchangeTicket redeems a stored ticket once, then deletes it', async () => {
    const { svc, store, redis } = build();
    store.set('cafe24:cust:ticket:tok1', 'session-token-1');
    const out = await svc.exchangeTicket('tok1');
    expect(out).toEqual({ sessionToken: 'session-token-1' });
    expect(redis.del).toHaveBeenCalledWith('cafe24:cust:ticket:tok1');
  });

  it('exchangeTicket rejects an unknown/expired ticket (E5018)', async () => {
    const { svc } = build();
    await expect(svc.exchangeTicket('nope')).rejects.toBeInstanceOf(BusinessException);
    await expect(svc.exchangeTicket('')).rejects.toBeInstanceOf(BusinessException);
  });

  it('start rejects a host whose mall is not connected (E5013)', async () => {
    const { svc, token } = build();
    token.findTenantIdByMallId.mockResolvedValueOnce(null);
    await expect(svc.start('unknownmall.cafe24.com', 'https://unknownmall.cafe24.com/')).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('start authorizes on the mall domain and never trusts a foreign return URL', async () => {
    const { svc, store } = build();
    const url = await svc.start('amoebaorder.cafe24.com', 'https://evil.example/steal');
    expect(url).toMatch(
      /^https:\/\/amoebaorder\.cafe24\.com\/api\/v2\/oauth\/authorize\?/,
    );
    expect(url).toContain('scope=mall.read_customer_identifier');
    // The persisted state must carry the mall-root fallback, not the attacker origin.
    const state = [...store.values()][0];
    expect(state).toContain('https://amoebaorder.cafe24.com/');
    expect(state).not.toContain('evil.example');
  });

  it('handleCallback rejects a missing/invalid state (E5015)', async () => {
    const { svc } = build();
    await expect(svc.handleCallback({ code: 'c' })).rejects.toBeInstanceOf(BusinessException);
    await expect(svc.handleCallback({ code: 'c', state: 'ghost' })).rejects.toBeInstanceOf(
      BusinessException,
    );
  });

  it('handleCallback adopts the member id from the token response (user_id)', async () => {
    const { svc, store, customer } = build();
    store.set(
      'cafe24:cust:state:st1',
      JSON.stringify({ tenantId: 7, mallId: 'amoebaorder', returnUrl: 'https://amoebaorder.cafe24.com/' }),
    );
    const realFetch = global.fetch;
    global.fetch = mockAuthFetch({ access_token: 'at-1', user_id: 'anhthutest1' }) as never;
    try {
      const out = await svc.handleCallback({ code: 'c1', state: 'st1' });
      expect(out.ticket).toBeTruthy();
      expect(customer.findOrCreateByCafe24Identifier).toHaveBeenCalledWith(7, 'uid-1');
      expect(customer.adoptCafe24MemberId).toHaveBeenCalledWith(7, 42, 'anhthutest1');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('handleCallback still signs in when the token response omits user_id', async () => {
    const { svc, store, customer } = build();
    store.set(
      'cafe24:cust:state:st2',
      JSON.stringify({ tenantId: 7, mallId: 'amoebaorder', returnUrl: 'https://amoebaorder.cafe24.com/' }),
    );
    const realFetch = global.fetch;
    global.fetch = mockAuthFetch({ access_token: 'at-2' }) as never;
    try {
      const out = await svc.handleCallback({ code: 'c2', state: 'st2' });
      expect(out.ticket).toBeTruthy();
      expect(customer.adoptCafe24MemberId).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });
});
