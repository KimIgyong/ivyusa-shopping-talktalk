import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AmaSsoService } from './ama-sso.service';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';
import { User } from '../user/entity/user.entity';
import { Tenant } from '../tenant/entity/tenant.entity';

/** Real-shaped (unsigned) JWT so JwtService.decode can read the payload. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

const AMA_TOKEN = fakeJwt({ sub: 'usr-1', entityId: 'ent-1', email: 'dev@amoeba.group' });

describe('AmaSsoService (PLN-260813-AMA-Iframe-SSO S2)', () => {
  // bigint PKs arrive as strings from TypeORM — fixtures must match (memory rule).
  const tenant = { id: '3', slug: 'amoebaorder', status: 'active' } as unknown as Tenant;
  const user = {
    id: '7',
    tenantId: '3',
    email: 'dev@amoeba.group',
    rank: 'master',
    status: 'active',
    mustChangePassword: 0,
  } as unknown as User;

  let tenantRow: Tenant | null;
  let userRow: User | null;
  let envOn: boolean;

  const config = {
    get: (key: string, def?: string) =>
      envOn
        ? ({
            AMA_SSO_TOKEN_URL: 'https://ama.example/api/v1/oauth/token',
            AMA_SSO_CLIENT_ID: 'cid',
            AMA_SSO_CLIENT_SECRET: 'csecret',
          })[key] ?? def
        : def,
  } as unknown as ConfigService;

  const limiter = {
    assertNotLocked: jest.fn(async () => undefined),
    recordFailure: jest.fn(async () => undefined),
    recordSuccess: jest.fn(async () => undefined),
  } as unknown as LoginRateLimitService;

  const audit = { write: jest.fn(async () => ({})) } as unknown as AuditService;
  const tokens = { accessToken: 'a', refreshToken: 'r' };
  const authService = {
    issueForSso: jest.fn(async () => tokens),
  } as unknown as AuthService;

  const userRepo = {
    findOne: jest.fn(async () => userRow),
  } as unknown as Repository<User>;
  const tenantRepo = {
    findOne: jest.fn(async () => tenantRow),
  } as unknown as Repository<Tenant>;

  let svc: AmaSsoService;
  const fetchMock = jest.fn();

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    envOn = true;
    tenantRow = tenant;
    userRow = user;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { access_token: 'oauth-at' } }),
    });
    svc = new AmaSsoService(
      userRepo,
      tenantRepo,
      config,
      new JwtService({}),
      authService,
      limiter,
      audit,
    );
  });

  const expectCode = async (p: Promise<unknown>, code: string) => {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BusinessException);
    expect((err as { errorCode: string }).errorCode).toBe(code);
  };

  it('issues ShopTalk tokens for a mapped active user (happy path)', async () => {
    const result = await svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4');
    expect(result).toBe(tokens);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ama.example/api/v1/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    );
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sent).toMatchObject({ grant_type: 'ama_session', ama_token: AMA_TOKEN });
    expect(authService.issueForSso).toHaveBeenCalledWith(user);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.sso_ama', tenantId: '3', actorId: '7' }),
    );
    expect(limiter.recordSuccess).toHaveBeenCalled();
  });

  it('rejects E5032 when AMA_SSO_* env is not configured (feature gate)', async () => {
    envOn = false;
    await expectCode(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4'), 'E5032');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects E5033 when AMA declines the exchange, and counts the failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: 'invalid' }) });
    await expectCode(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4'), 'E5033');
    expect(limiter.recordFailure).toHaveBeenCalled();
    expect(authService.issueForSso).not.toHaveBeenCalled();
  });

  it('rejects E5033 when AMA is unreachable (fetch throws)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expectCode(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4'), 'E5033');
  });

  it('rejects E5033 when the exchanged token has no email claim', async () => {
    const noEmail = fakeJwt({ sub: 'usr-1', entityId: 'ent-1' });
    await expectCode(svc.login(noEmail, 'amoebaorder', '1.2.3.4'), 'E5033');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: 'no_email_claim' }) }),
    );
  });

  it('rejects E5034 when no account matches the email in the slug tenant', async () => {
    userRow = null;
    await expectCode(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4'), 'E5034');
    expect(limiter.recordFailure).toHaveBeenCalled();
  });

  it('rejects E5034 for a suspended user and for a suspended tenant alike', async () => {
    userRow = { ...user, status: 'suspended' } as unknown as User;
    await expectCode(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4'), 'E5034');

    userRow = user;
    tenantRow = { ...tenant, status: 'suspended' } as unknown as Tenant;
    await expectCode(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4'), 'E5034');
    expect(authService.issueForSso).not.toHaveBeenCalled();
  });

  it('rejects E5034 for an unknown tenant slug without leaking which part failed', async () => {
    tenantRow = null;
    await expectCode(svc.login(AMA_TOKEN, 'nope', '1.2.3.4'), 'E5034');
  });

  it('propagates the lockout from the rate limiter before any network call', async () => {
    (limiter.assertNotLocked as jest.Mock).mockRejectedValueOnce(new Error('locked'));
    await expect(svc.login(AMA_TOKEN, 'amoebaorder', '1.2.3.4')).rejects.toThrow('locked');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
