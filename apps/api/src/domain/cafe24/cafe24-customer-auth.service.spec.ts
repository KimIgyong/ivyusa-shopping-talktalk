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
  const customer = { findOrCreateByCafe24Identifier: jest.fn(async () => ({ id: 42 })) };
  const token = { findTenantIdByMallId: jest.fn(async () => 7), getConnection: jest.fn(async () => null) };
  const admin = { fetchCustomerByIdentifier: jest.fn() };
  const sync = { syncOrders: jest.fn() };
  const svc = new Cafe24CustomerAuthService(
    redis as never,
    session as never,
    customer as never,
    token as never,
    admin as never,
    sync as never,
  );
  return { svc, redis, session, token, store };
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
});
