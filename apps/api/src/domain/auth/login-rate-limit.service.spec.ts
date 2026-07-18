import { LoginRateLimitService } from './login-rate-limit.service';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** Minimal in-memory Redis stand-in (get/set/incr/del) for limiter logic. */
class FakeRedis {
  private store = new Map<string, number>();
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? String(this.store.get(key)) : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, Number(value));
  }
  async incr(key: string): Promise<number> {
    const next = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, next);
    return next;
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('LoginRateLimitService', () => {
  const IP = '203.0.113.7';
  let svc: LoginRateLimitService;

  beforeEach(() => {
    svc = new LoginRateLimitService(new FakeRedis() as unknown as RedisService);
  });

  const failN = async (scope: string, email: string, ip: string, n: number) => {
    for (let i = 0; i < n; i++) await svc.recordFailure(scope, email, ip);
  };

  it('allows login while under the account threshold', async () => {
    await failN('user', 'a@x.com', IP, 4);
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).resolves.toBeUndefined();
  });

  it('locks the account after 5 failed attempts', async () => {
    await failN('user', 'a@x.com', IP, 5);
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).rejects.toThrow();
  });

  it('clears the account lock on a successful login', async () => {
    await failN('user', 'a@x.com', IP, 5);
    await svc.recordSuccess('user', 'a@x.com');
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).resolves.toBeUndefined();
  });

  it('locks a fresh account from an IP that exceeded the IP budget', async () => {
    // 20 failures from the same IP across distinct emails (each account stays at 1).
    for (let i = 0; i < 20; i++) await svc.recordFailure('user', `u${i}@x.com`, IP);
    await expect(svc.assertNotLocked('user', 'fresh@x.com', IP)).rejects.toThrow();
  });

  it('is case-insensitive on the account key', async () => {
    await failN('user', 'A@X.com', IP, 5);
    await expect(svc.assertNotLocked('user', 'a@x.com', IP)).rejects.toThrow();
  });

  it('scopes account counters (admin failures do not lock user login)', async () => {
    await failN('admin', 'a@x.com', IP, 5);
    await expect(svc.assertNotLocked('user', 'a@x.com', '198.51.100.9')).resolves.toBeUndefined();
  });
});
