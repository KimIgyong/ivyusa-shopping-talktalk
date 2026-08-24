import { randomBytes } from 'node:crypto';
import { Cafe24TokenService } from './cafe24-token.service';
import { encryptSecret, decryptSecret } from '../../global/util/crypto.util';

/**
 * What the mall grants can shrink without anything changing on our side, and
 * until the refresh read it back the record kept claiming the original set —
 * so the first sign was a 403 half an hour later that the record contradicted.
 */
describe('Cafe24TokenService.refresh — recorded scopes', () => {
  const OLD_ENV = process.env;
  let saved: any[];
  let warns: string[];

  const build = (credScopes: string[]) => {
    const cred: any = {
      id: 1,
      tenantId: 3,
      provider: 'cafe24',
      secretEnc: encryptSecret(
        JSON.stringify({ mallId: 'amoebaorder', refreshToken: 'r1', scopes: credScopes }),
      ),
    };
    saved = [];
    const repo = {
      findOne: jest.fn(async () => cred),
      save: jest.fn(async (c: any) => {
        saved.push(JSON.parse(decryptSecret(c.secretEnc)));
        return c;
      }),
    };
    const svc = new Cafe24TokenService(repo as never);
    warns = [];
    jest.spyOn((svc as any).logger, 'warn').mockImplementation((m: string) => warns.push(m));
    jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);
    return { svc, cred };
  };

  const respond = (body: Record<string, unknown>) => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => body })) as never;
  };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      CAFE24_CLIENT_ID: 'cid',
      CAFE24_CLIENT_SECRET: 'sec',
      // The credential is stored encrypted; any 32-byte key works as long as
      // the same one round-trips within the test.
      CRED_ENC_KEY: randomBytes(32).toString('base64'),
    };
  });
  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('writes back the scopes the mall actually granted', async () => {
    const { svc, cred } = build(['mall.read_order', 'mall.read_product']);
    respond({ access_token: 'a1', expires_in: 7200, scopes: ['mall.read_product'] });

    await (svc as any).refresh(3, JSON.parse(decryptSecret(cred.secretEnc)), cred);

    expect(saved[0].scopes).toEqual(['mall.read_product']);
  });

  it('names the lost scope and the fix, since the 403 it causes explains neither', async () => {
    const { svc, cred } = build(['mall.read_order', 'mall.read_product']);
    respond({ access_token: 'a1', scopes: ['mall.read_product'] });

    await (svc as any).refresh(3, JSON.parse(decryptSecret(cred.secretEnc)), cred);

    expect(warns.join(' ')).toContain('mall.read_order');
    expect(warns.join(' ')).toContain('re-authorise');
  });

  it('saves a scope change even when the refresh token did not rotate', async () => {
    // Saving only on rotation was how the stale record survived: an unrotated
    // refresh carried the old scopes forward untouched.
    const { svc, cred } = build(['mall.read_order']);
    respond({ access_token: 'a1', refresh_token: 'r1', scopes: ['mall.read_product'] });

    await (svc as any).refresh(3, JSON.parse(decryptSecret(cred.secretEnc)), cred);

    expect(saved).toHaveLength(1);
    expect(saved[0].scopes).toEqual(['mall.read_product']);
    expect(saved[0].refreshToken).toBe('r1');
  });

  it('leaves the record alone when the response says nothing about scopes', async () => {
    // Absence is not a revocation — dropping the record would lose the only
    // thing we know about the grant.
    const { svc, cred } = build(['mall.read_order']);
    respond({ access_token: 'a1', refresh_token: 'r2' });

    await (svc as any).refresh(3, JSON.parse(decryptSecret(cred.secretEnc)), cred);

    expect(saved[0].scopes).toEqual(['mall.read_order']);
    expect(saved[0].refreshToken).toBe('r2');
    expect(warns.join(' ')).not.toContain('no longer grants');
  });
});
