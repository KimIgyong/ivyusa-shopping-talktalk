import { Cafe24OAuthService } from './cafe24-oauth.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Callback handling — what happens when Cafe24 says no (PLN-260808 D7). */
describe('Cafe24OAuthService.handleCallback', () => {
  function build() {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const tenantService = { upsertCredential: jest.fn() };
    const tokenService = { findTenantIdByMallId: jest.fn().mockResolvedValue(null) };
    const svc = new Cafe24OAuthService(redis as never, tenantService as never, tokenService as never);
    const warn = jest.spyOn(svc['logger'], 'warn').mockImplementation(() => undefined);
    return { svc, redis, warn };
  }

  afterEach(() => jest.restoreAllMocks());

  /**
   * A refusal used to surface as "invalid or expired state" — the message points
   * at ShopTalk while the actual fix (a permission the app registration lacks)
   * is in Cafe24's developer admin. Diagnosing the real case cost a trip through
   * the nginx access log.
   */
  it('reports Cafe24 own refusal, and logs the reason it gave', async () => {
    const { svc, warn } = build();

    await expect(
      svc.handleCallback({
        error: 'invalid_scope',
        error_description: 'The%2Bscope%2Badded%2Bby%2BCafe24%2BDevelopers%2Bis%2Binvalid.',
        state: 'abc',
      }),
    ).rejects.toMatchObject({ errorCode: ERROR_CODE.CAFE24_OAUTH_REFUSED.code });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid_scope'));
    // The description is URL-encoded with '+' for spaces — decoded, not dumped raw.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('The scope added by Cafe24 Developers is invalid.'));
  });

  it('still rejects a callback that carries neither an error nor a code', async () => {
    const { svc, warn } = build();
    await expect(svc.handleCallback({ state: 'abc' })).rejects.toBeInstanceOf(BusinessException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('without code'));
  });

  it('rejects an unknown state (expired or forged)', async () => {
    const { svc } = build(); // redis.get → null
    await expect(svc.handleCallback({ code: 'c', state: 'gone' })).rejects.toMatchObject({
      errorCode: ERROR_CODE.CAFE24_OAUTH_STATE_INVALID.code,
    });
  });
});

/**
 * Install guards (REQ-260819). amoebaorder was connected to the `annehearts`
 * mall: sign-in broke outright, and order sync quietly cached another
 * merchant's orders under it. Nothing in the code said no.
 */
describe('Cafe24OAuthService.createInstall guards', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, CAFE24_CLIENT_ID: 'cid', CAFE24_CLIENT_SECRET: 'secret' };
  });
  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  function build(opts: {
    tenant: { shopDomain?: string | null; storefrontUrl?: string | null };
    mallOwner?: number | null;
  }) {
    const redis = { get: jest.fn(), set: jest.fn().mockResolvedValue(undefined), del: jest.fn() };
    const tenantService = {
      upsertCredential: jest.fn(),
      findById: jest.fn().mockResolvedValue(opts.tenant),
    };
    const tokenService = {
      findTenantIdByMallId: jest.fn().mockResolvedValue(opts.mallOwner ?? null),
    };
    const svc = new Cafe24OAuthService(redis as never, tenantService as never, tokenService as never);
    const warn = jest.spyOn(svc['logger'], 'warn').mockImplementation(() => undefined);
    return { svc, warn, redis };
  }

  it('refuses a mall that is not the one the tenant runs on', async () => {
    const { svc, warn, redis } = build({
      tenant: { shopDomain: 'amoebaorder.cafe24.com', storefrontUrl: 'https://amoebaorder.cafe24.com' },
    });

    await expect(svc.createInstall(3, 'annehearts')).rejects.toMatchObject({
      errorCode: ERROR_CODE.CAFE24_MALL_TENANT_MISMATCH.code,
    });
    // Refused before any state was written — nothing half-started.
    expect(redis.set).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('annehearts'));
  });

  it('accepts the tenant own mall, in any host form', async () => {
    for (const mall of ['amoebaorder', 'amoebaorder.cafe24.com', 'AmoebaOrder']) {
      const { svc } = build({ tenant: { shopDomain: 'amoebaorder.cafe24.com' } });
      await expect(svc.createInstall(3, mall)).resolves.toMatchObject({
        authorizeUrl: expect.stringContaining('amoebaorder'),
      });
    }
  });

  it('allows a custom-domain tenant, and says so', async () => {
    // No mall id is readable from shop.example.com, so this cannot be verified.
    // Refusing here would block a legitimate install to catch a typo.
    const { svc, warn } = build({ tenant: { shopDomain: 'shop.example.com' } });

    await expect(svc.createInstall(9, 'somemall')).resolves.toMatchObject({
      authorizeUrl: expect.stringContaining('somemall'),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no verifiable cafe24.com storefront'));
  });

  it('refuses a mall another tenant already owns', async () => {
    // Two owners make the public sign-in lookup ambiguous — it resolved to
    // whichever row the scan reached first.
    const { svc } = build({ tenant: { shopDomain: 'annehearts.cafe24.com' }, mallOwner: 2 });

    await expect(svc.createInstall(3, 'annehearts')).rejects.toMatchObject({
      errorCode: ERROR_CODE.CAFE24_MALL_ALREADY_CONNECTED.code,
    });
  });

  it('lets a tenant reconnect the mall it already owns', async () => {
    const { svc } = build({ tenant: { shopDomain: 'annehearts.cafe24.com' }, mallOwner: 2 });
    await expect(svc.createInstall(2, 'annehearts')).resolves.toBeDefined();
  });
});
