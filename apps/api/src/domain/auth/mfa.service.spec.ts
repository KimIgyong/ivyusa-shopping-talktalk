import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { FindOperator, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { AdminUser } from './entity/admin-user.entity';
import { MfaCredential } from './entity/mfa-credential.entity';
import { MfaRecoveryCode } from './entity/mfa-recovery-code.entity';
import { User } from '../user/entity/user.entity';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { encryptSecret } from '../../global/util/crypto.util';
import { generateTotpSecret, timeStep, totpCode } from '../../global/util/totp.util';
import { MfaChallengeResponse } from './dto/response/auth.response';
import { Principal } from '@ivy/types';

const PASSWORD = 'secret-pw';
const IP = '203.0.113.7';

/** In-memory Redis stand-in (matches auth.service.spec). */
class FakeRedis {
  private store = new Map<string, string>();
  available(): boolean {
    return true;
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

/** Minimal in-memory repository understanding the exact queries MfaService issues. */
class FakeRepo<T extends { id?: number }> {
  rows: T[] = [];
  private seq = 1;

  findOne = jest.fn(async (opts: { where: Record<string, unknown> }) =>
    this.rows.find((r) => this.matches(r, opts.where)) ?? null,
  );
  find = jest.fn(async (opts: { where: Record<string, unknown> }) =>
    this.rows.filter((r) => this.matches(r, opts.where)),
  );
  create = jest.fn((obj: Partial<T>) => ({ ...obj }) as T);
  save = jest.fn(async (rowOrRows: T | T[]) => {
    for (const row of Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]) {
      if (row.id == null) (row as { id?: number }).id = this.seq++;
      if (!this.rows.includes(row)) {
        const i = this.rows.findIndex((r) => r.id === row.id);
        if (i >= 0) this.rows[i] = row;
        else this.rows.push(row);
      }
    }
    return rowOrRows;
  });
  delete = jest.fn(async (where: Record<string, unknown>) => {
    this.rows = this.rows.filter((r) => !this.matches(r, where));
  });

  seed(row: Omit<T, 'id'>): T {
    const full = { ...row, id: this.seq++ } as T;
    this.rows.push(full);
    return full;
  }

  private matches(row: T, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => {
      if (v instanceof FindOperator) {
        return v.type === 'isNull' ? (row as Record<string, unknown>)[k] == null : true;
      }
      return (row as Record<string, unknown>)[k] === v;
    });
  }
}

describe('MFA step-up flow (PLN-MFA Stage M1)', () => {
  let auth: AuthService;
  let mfa: MfaService;
  let jwt: JwtService;
  let credRepo: FakeRepo<MfaCredential>;
  let codeRepo: FakeRepo<MfaRecoveryCode>;
  let user: User;
  let admin: AdminUser;
  let audit: { write: jest.Mock };
  let limiter: { assertNotLocked: jest.Mock; recordFailure: jest.Mock; recordSuccess: jest.Mock };

  const userPrincipal: Principal = {
    actorType: 'user',
    userId: 7,
    tenantId: 1,
    email: 'dev@amoeba.group',
    rank: 'master',
    labels: [],
  };
  const adminPrincipal: Principal = {
    actorType: 'admin',
    adminId: 3,
    email: 'admin@amoeba.group',
    level: 'super_admin',
  };

  const config = {
    get: (key: string, def?: string) =>
      ({ JWT_REFRESH_SECRET: 'refresh-secret', JWT_REFRESH_TTL: '604800' })[key] ?? def,
  } as unknown as ConfigService;

  const accountRepo = <T extends object>(row: () => T | null) =>
    ({
      findOne: jest.fn(async () => row()),
      findOneByOrFail: jest.fn(async () => row()),
      save: jest.fn(async (e: T) => e),
    }) as unknown as Repository<T>;

  /** Seed an ACTIVE credential + 2 recovery codes without paying full-cost bcrypt. */
  const seedEnrolled = async (actorType: 'admin' | 'user', actorId: number) => {
    const secret = generateTotpSecret();
    const cred = credRepo.seed({
      actorType,
      actorId,
      secretEnc: encryptSecret(secret).toString('base64'),
      enabledAt: new Date(),
      lastUsedStep: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const recoveryCodes = ['abc12-def34', '98765-fedcb'];
    for (const code of recoveryCodes) {
      codeRepo.seed({
        credentialId: cred.id,
        codeHash: await bcrypt.hash(code, 4),
        usedAt: null,
        createdAt: new Date(),
      });
    }
    return { secret, recoveryCodes, cred };
  };

  beforeAll(() => {
    process.env.CRED_ENC_KEY = randomBytes(32).toString('base64');
  });

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

    credRepo = new FakeRepo<MfaCredential>();
    codeRepo = new FakeRepo<MfaRecoveryCode>();
    audit = { write: jest.fn() };
    limiter = {
      assertNotLocked: jest.fn(),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
    };
    jwt = new JwtService({ secret: 'access-secret', signOptions: { expiresIn: 900 } });

    const adminRepo = accountRepo(() => admin);
    const userRepo = accountRepo(() => user);
    mfa = new MfaService(
      credRepo as unknown as Repository<MfaCredential>,
      codeRepo as unknown as Repository<MfaRecoveryCode>,
      adminRepo as Repository<AdminUser>,
      userRepo as Repository<User>,
      limiter as unknown as LoginRateLimitService,
      audit as unknown as AuditService,
    );
    auth = new AuthService(
      adminRepo as Repository<AdminUser>,
      userRepo as Repository<User>,
      { findByIds: jest.fn(async () => []) } as never,
      { find: jest.fn(async () => []) } as never,
      accountRepo(() => ({ id: 1, status: 'active' }) as never) as never,
      jwt,
      config,
      limiter as unknown as LoginRateLimitService,
      new FakeRedis() as unknown as RedisService,
      audit as unknown as AuditService,
      mfa,
    );
  });

  it(
    'full enrollment: enroll → verify activates and returns 10 one-time recovery codes',
    async () => {
      const enrolled = await mfa.enroll(userPrincipal);
      expect(enrolled.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(enrolled.otpauthUri).toBe(
        `otpauth://totp/ShopTalk:dev%40amoeba.group?secret=${enrolled.secret}&issuer=ShopTalk&algorithm=SHA1&digits=6&period=30`,
      );
      // Secret is stored encrypted, never plaintext.
      expect(credRepo.rows[0].secretEnc).not.toContain(enrolled.secret);
      await expect(mfa.status(userPrincipal)).resolves.toEqual({ enrolled: false, enabledAt: null });

      // Re-calling while pending regenerates the secret.
      const again = await mfa.enroll(userPrincipal);
      expect(again.secret).not.toBe(enrolled.secret);

      const { recoveryCodes } = await mfa.enrollVerify(userPrincipal, totpCode(again.secret, timeStep()));
      expect(recoveryCodes).toHaveLength(10);
      for (const code of recoveryCodes) expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
      expect(new Set(recoveryCodes).size).toBe(10);
      // Only bcrypt hashes at rest.
      expect(codeRepo.rows.map((r) => r.codeHash)).not.toEqual(expect.arrayContaining(recoveryCodes));
      const status = await mfa.status(userPrincipal);
      expect(status.enrolled).toBe(true);
      expect(status.enabledAt).toEqual(expect.any(String));
      expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.enrolled' }));
    },
    60_000, // 10 recovery-code hashes at production bcrypt cost
  );

  it('rejects a wrong enrollment confirmation code with E1011 and stays pending', async () => {
    const { secret } = await mfa.enroll(userPrincipal);
    const base = timeStep();
    const valid = new Set([-1, 0, 1].map((o) => totpCode(secret, base + o)));
    const wrong = ['000000', '123456', '999999'].find((c) => !valid.has(c)) as string;
    await expect(mfa.enrollVerify(userPrincipal, wrong)).rejects.toMatchObject({ errorCode: 'E1011' });
    await expect(mfa.status(userPrincipal)).resolves.toMatchObject({ enrolled: false });
  });

  it('login with enabled MFA returns mfaRequired + mfaToken and NO tokens/principal', async () => {
    await seedEnrolled('user', 7);
    const res = await auth.loginUser(user.email, PASSWORD, IP);
    expect(res).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    // Login is not complete: no auth.login audit yet.
    expect(audit.write).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login' }));
    // The step-up token is purpose-limited.
    const decoded = jwt.decode((res as MfaChallengeResponse).mfaToken) as Record<string, unknown>;
    expect(decoded.purpose).toBe('mfa');
    expect(decoded.sub).toBe('7');
  });

  it('login without MFA is unchanged (backward compat)', async () => {
    const res = await auth.loginUser(user.email, PASSWORD, IP);
    expect(res).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      principal: expect.objectContaining({ actorType: 'user', id: 7 }),
    });
  });

  it('verify with a valid TOTP issues the same response shape as login', async () => {
    const { secret } = await seedEnrolled('user', 7);
    const challenge = (await auth.loginUser(user.email, PASSWORD, IP)) as MfaChallengeResponse;
    const res = await auth.verifyMfa(challenge.mfaToken, totpCode(secret, timeStep()), IP);
    expect(res).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      mustChangePassword: false,
      principal: expect.objectContaining({ actorType: 'user', id: 7, tenantId: 1, rank: 'master' }),
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', metadata: { mfa: true } }),
    );
    expect(limiter.recordSuccess).toHaveBeenCalledWith('mfa', 'user:7');
  });

  it('rejects a replayed same-step TOTP with E1011 and records a rate-limit failure', async () => {
    const { secret } = await seedEnrolled('user', 7);
    const challenge = (await auth.loginUser(user.email, PASSWORD, IP)) as MfaChallengeResponse;
    const code = totpCode(secret, timeStep());
    await auth.verifyMfa(challenge.mfaToken, code, IP);
    await expect(auth.verifyMfa(challenge.mfaToken, code, IP)).rejects.toMatchObject({
      errorCode: 'E1011',
    });
    expect(limiter.recordFailure).toHaveBeenCalledWith('mfa', 'user:7', IP);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'mfa.verify_failed', result: 'denied' }),
    );
  });

  it('accepts a recovery code exactly once (single-use)', async () => {
    const { recoveryCodes } = await seedEnrolled('user', 7);
    const challenge = (await auth.loginUser(user.email, PASSWORD, IP)) as MfaChallengeResponse;
    const res = await auth.verifyMfa(challenge.mfaToken, recoveryCodes[0], IP);
    expect(res).toMatchObject({ accessToken: expect.any(String) });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.recovery_used' }));
    // Second use of the SAME code is rejected...
    await expect(auth.verifyMfa(challenge.mfaToken, recoveryCodes[0], IP)).rejects.toMatchObject({
      errorCode: 'E1011',
    });
    // ...while the other codes remain usable.
    await expect(
      auth.verifyMfa(challenge.mfaToken, recoveryCodes[1], IP),
    ).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it('rejects a non-mfa (access) token and garbage at /auth/mfa/verify with 401', async () => {
    await seedEnrolled('user', 7);
    const accessToken = jwt.sign({ actorType: 'user', userId: 7, tenantId: 1 });
    await expect(auth.verifyMfa(accessToken, '123456', IP)).rejects.toMatchObject({
      errorCode: 'E1001',
    });
    await expect(auth.verifyMfa('not-a-jwt', '123456', IP)).rejects.toMatchObject({
      errorCode: 'E1001',
    });
  });

  it('admin account: step-up challenge and verify mirror the admin login response', async () => {
    const { secret } = await seedEnrolled('admin', 3);
    const challenge = (await auth.loginAdmin(admin.email, PASSWORD, IP)) as MfaChallengeResponse;
    expect(challenge).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    const res = await auth.verifyMfa(challenge.mfaToken, totpCode(secret, timeStep()), IP);
    expect(res).toMatchObject({
      accessToken: expect.any(String),
      principal: expect.objectContaining({ actorType: 'admin', id: 3, level: 'super_admin' }),
    });
  });

  it('enroll while already enabled is rejected with E1012 (409)', async () => {
    await seedEnrolled('user', 7);
    await expect(mfa.enroll(userPrincipal)).rejects.toMatchObject({ errorCode: 'E1012' });
  });

  it('disable requires the account password AND a valid code, then removes the credential', async () => {
    const { secret } = await seedEnrolled('user', 7);
    await expect(
      mfa.disable(userPrincipal, 'wrong-password', totpCode(secret, timeStep()), IP),
    ).rejects.toMatchObject({ errorCode: 'E1002' });
    expect(limiter.recordFailure).toHaveBeenCalledWith('mfa', 'user:7', IP);

    const res = await mfa.disable(userPrincipal, PASSWORD, totpCode(secret, timeStep()), IP);
    expect(res).toEqual({ disabled: true });
    expect(credRepo.rows).toHaveLength(0);
    expect(codeRepo.rows).toHaveLength(0);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'mfa.disabled' }));
    // Next login is a plain login again.
    await expect(auth.loginUser(user.email, PASSWORD, IP)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
  });

  it('disable also accepts a recovery code as the second factor', async () => {
    const { recoveryCodes } = await seedEnrolled('user', 7);
    await expect(mfa.disable(userPrincipal, PASSWORD, recoveryCodes[0], IP)).resolves.toEqual({
      disabled: true,
    });
  });

  it('admin mfa-reset deletes the credential + codes and audits the resetting actor', async () => {
    await seedEnrolled('user', 7);
    const res = await mfa.resetForUser(1, 7, adminPrincipal);
    expect(res).toEqual({ reset: true });
    expect(credRepo.rows).toHaveLength(0);
    expect(codeRepo.rows).toHaveLength(0);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mfa.reset',
        actorType: 'admin',
        actorId: 3,
        target: 'user:7',
        tenantId: 1,
        metadata: expect.objectContaining({ hadCredential: true, email: 'de*@amoeba.group' }),
      }),
    );
    // Target logs in without a challenge afterwards.
    await expect(auth.loginUser(user.email, PASSWORD, IP)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
  });

  it('mfa-reset refuses a cross-tenant target (E1006)', async () => {
    await seedEnrolled('user', 7);
    await expect(mfa.resetForUser(2, 7, adminPrincipal)).rejects.toMatchObject({
      errorCode: 'E1006',
    });
    expect(credRepo.rows).toHaveLength(1);
  });

  it('verify against a reset credential fails with 401 (stale step-up token)', async () => {
    const { secret } = await seedEnrolled('user', 7);
    const challenge = (await auth.loginUser(user.email, PASSWORD, IP)) as MfaChallengeResponse;
    await mfa.resetForUser(1, 7, adminPrincipal);
    await expect(
      auth.verifyMfa(challenge.mfaToken, totpCode(secret, timeStep()), IP),
    ).rejects.toMatchObject({ errorCode: 'E1001' });
  });
});
