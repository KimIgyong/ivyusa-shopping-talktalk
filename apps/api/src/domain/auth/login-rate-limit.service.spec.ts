import { LoginRateLimitService } from './login-rate-limit.service';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** Minimal in-memory Redis stand-in (get/set/incr/del) for limiter logic. */
class FakeRedis {
  private store = new Map<string, number>();
  private ttls = new Map<string, number>();
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? String(this.store.get(key)) : null;
  }
  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.store.set(key, Number(value));
    if (ttl !== undefined) this.ttls.set(key, ttl);
  }
  async incr(key: string): Promise<number> {
    const next = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, next);
    return next;
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.ttls.delete(key);
  }
  expiresIn(key: string): number | undefined {
    return this.ttls.get(key);
  }
}

describe('LoginRateLimitService', () => {
  const IP = '203.0.113.7';
  let svc: LoginRateLimitService;
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    svc = new LoginRateLimitService(redis as unknown as RedisService);
  });

  const failN = async (scope: string, email: string, ip: string, n: number) => {
    for (let i = 0; i < n; i++) await svc.recordFailure(scope, email, ip);
  };

  it('allows login while under the account threshold', async () => {
    await failN('user', 'a@x.com', IP, 9);
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).resolves.toBeUndefined();
  });

  it('locks the account after 10 failed attempts', async () => {
    await failN('user', 'a@x.com', IP, 10);
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).rejects.toThrow();
  });

  it('keeps failed-login counters for 10 minutes', async () => {
    await svc.recordFailure('user', 'a@x.com', IP);

    expect(redis.expiresIn('login:fail:acct:user:a@x.com')).toBe(10 * 60);
    expect(redis.expiresIn(`login:fail:ip:user:${IP}`)).toBe(10 * 60);
  });

  it('clears the account lock on a successful login', async () => {
    await failN('user', 'a@x.com', IP, 10);
    await svc.recordSuccess('user', 'a@x.com');
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).resolves.toBeUndefined();
  });

  it('clears an account lock without bypassing the IP safeguard', async () => {
    await failN('user', 'a@x.com', IP, 10);
    for (let i = 0; i < 20; i++) await svc.recordFailure('user', `u${i}@x.com`, IP);

    await svc.clearAccountLock('user', 'a@x.com');

    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).rejects.toThrow();
  });

  it('locks a fresh account from an IP that exceeded the IP budget', async () => {
    // 20 failures from the same IP across distinct emails (each account stays at 1).
    for (let i = 0; i < 20; i++) await svc.recordFailure('user', `u${i}@x.com`, IP);
    await expect(svc.assertNotLocked('user', 'fresh@x.com', IP)).rejects.toThrow();
  });

  it('is case-insensitive on the account key', async () => {
    await failN('user', 'A@X.com', IP, 10);
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).rejects.toThrow();
  });

  it('scopes account counters (admin failures do not lock user login)', async () => {
    await failN('admin', 'a@x.com', IP, 5);
    await expect(svc.assertNotLocked('user', 'a@x.com', '198.51.100.9')).resolves.toBeUndefined();
  });
});
