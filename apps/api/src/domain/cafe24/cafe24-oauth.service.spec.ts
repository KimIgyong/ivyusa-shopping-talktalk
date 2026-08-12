import { Cafe24OAuthService } from './cafe24-oauth.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Callback handling — what happens when Cafe24 says no (PLN-260808 D7). */
describe('Cafe24OAuthService.handleCallback', () => {
  function build() {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const tenantService = { upsertCredential: jest.fn() };
    const svc = new Cafe24OAuthService(redis as never, tenantService as never);
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
