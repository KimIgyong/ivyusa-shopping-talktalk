import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { AdminUser } from './entity/admin-user.entity';
import { User } from '../user/entity/user.entity';
import { LoginRateLimitService } from './login-rate-limit.service';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** In-memory Redis stand-in with the availability flag the service consults. */
class FakeRedis {
  up = true;
  private store = new Map<string, string>();
  available(): boolean {
    return this.up;
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const PASSWORD = 'secret-pw';

describe('AuthService (SEC-M1/SEC-M2)', () => {
  let svc: AuthService;
  let redis: FakeRedis;
  let jwt: JwtService;
  let user: User;
  let admin: AdminUser;

  const config = {
    get: (key: string, def?: string) =>
      ({ JWT_REFRESH_SECRET: 'refresh-secret', JWT_REFRESH_TTL: '604800' })[key] ?? def,
  } as unknown as ConfigService;

  const limiter = {
    assertNotLocked: jest.fn(),
    recordFailure: jest.fn(),
    recordSuccess: jest.fn(),
  } as unknown as LoginRateLimitService;

  const repo = <T extends object>(row: () => T | null) =>
    ({
      findOne: jest.fn(async () => row()),
      findOneByOrFail: jest.fn(async () => {
        const r = row();
        if (!r) throw new Error('not found');
        return r;
      }),
      save: jest.fn(async (e: T) => e),
    }) as unknown as Repository<T>;

  beforeEach(async () => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    user = {
      id: 7,
      tenantId: 1,
      email: 'dev@amoeba.group',
      passwordHash: hash,
      rank: 'master',
      status: 'active',
      mustChangePassword: 0,
      passwordChangedAt: null,
    } as User;
    admin = {
      id: 3,
      email: 'admin@amoeba.group',
      passwordHash: hash,
      level: 'super_admin',
      status: 'active',
      mustChangePassword: 0,
      passwordChangedAt: null,
    } as AdminUser;

    redis = new FakeRedis();
    jwt = new JwtService({ secret: 'access-secret', signOptions: { expiresIn: 900 } });
    svc = new AuthService(
      repo(() => admin) as Repository<AdminUser>,
      repo(() => user) as Repository<User>,
      { findByIds: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      repo(() => ({ id: 1 }) as never) as never,
      jwt,
      config,
      limiter,
      redis as unknown as RedisService,
      { write: jest.fn() } as never,
    );
  });

  it('rotates the refresh token: each is single-use', async () => {
    const first = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    const second = await svc.refresh(first.refreshToken);
    expect(second.refreshToken).not.toEqual(first.refreshToken);
    // Replaying the consumed token must fail.
    await expect(svc.refresh(first.refreshToken)).rejects.toThrow();
    // The rotated token still works.
    await expect(svc.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('rejects an access token presented as a refresh token', async () => {
    const tokens = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    await expect(svc.refresh(tokens.accessToken)).rejects.toThrow();
  });

  it('rejects refresh tokens issued before the last password change', async () => {
    const tokens = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    user.passwordChangedAt = new Date(Date.now() + 5_000); // strictly later second
    await expect(svc.refresh(tokens.refreshToken)).rejects.toThrow();
  });

  it('rejects refresh for a suspended user even with a live jti', async () => {
    const tokens = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    user.status = 'suspended';
    await expect(svc.refresh(tokens.refreshToken)).rejects.toThrow();
  });

  it('changePassword stamps password_changed_at, clears the flag, and returns fresh tokens', async () => {
    user.mustChangePassword = 1;
    // The controller passes req.user — the decoded JWT payload, which carries
    // iat/exp/pwdPending. issue() must strip those before re-signing.
    const reqUser = {
      actorType: 'user',
      userId: user.id,
      tenantId: 1,
      email: user.email,
      rank: 'master',
      labels: [],
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 840,
      pwdPending: true,
    };
    const tokens = await svc.changePassword(reqUser as never, PASSWORD, 'brand-new-pw-123');
    const decoded = jwt.decode(tokens.accessToken) as { pwdPending?: boolean };
    expect(decoded.pwdPending).toBeUndefined();
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect(user.mustChangePassword).toBe(0);
    expect(tokens.mustChangePassword).toBe(false);
    // The pair issued by the change itself must survive the revocation stamp.
    await expect(svc.refresh(tokens.refreshToken)).resolves.toBeDefined();
  });

  it('marks the access token pwd-pending while must-change is set (admin)', async () => {
    admin.mustChangePassword = 1;
    const tokens = await svc.loginAdmin(admin.email, PASSWORD, '203.0.113.7');
    const decoded = jwt.decode(tokens.accessToken) as { pwdPending?: boolean };
    expect(decoded.pwdPending).toBe(true);
    // refresh() reloads the flag from the DB instead of hardcoding false (SEC-M2).
    const refreshed = await svc.refresh(tokens.refreshToken);
    expect(refreshed.mustChangePassword).toBe(true);
  });

  it('omits the pwd-pending claim once the flag is clear', async () => {
    const tokens = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    const decoded = jwt.decode(tokens.accessToken) as { pwdPending?: boolean };
    expect(decoded.pwdPending).toBeUndefined();
  });

  it('logout revokes the presented refresh token', async () => {
    const tokens = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    await svc.logout(tokens.refreshToken);
    await expect(svc.refresh(tokens.refreshToken)).rejects.toThrow();
  });

  it('degrades open (signature/DB checks only) when Redis is down', async () => {
    const tokens = await svc.loginUser(user.email, PASSWORD, '203.0.113.7');
    redis.up = false;
    await expect(svc.refresh(tokens.refreshToken)).resolves.toBeDefined();
  });
});
