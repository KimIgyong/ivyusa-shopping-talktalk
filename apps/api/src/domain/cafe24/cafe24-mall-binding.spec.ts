import { Cafe24TokenService } from './cafe24-token.service';
import { Cafe24SyncService } from './cafe24-sync.service';
import { expectedMallIdForTenant, mallIdFromHost } from './cafe24-mall';
import { encryptSecret } from '../../global/util/crypto.util';

/**
 * Mall ↔ tenant binding (REQ-260819).
 *
 * amoebaorder held a Cafe24 credential for the `annehearts` mall. Sign-in failed
 * outright because no credential claimed `amoebaorder`, and order sync — which
 * reads the credential and never the tenant — cached 65 of another merchant's
 * orders under it, 17 already bound to amoebaorder customers.
 */
describe('cafe24-mall helpers', () => {
  it('reads a mall id out of any host form', () => {
    expect(mallIdFromHost('amoebaorder.cafe24.com')).toBe('amoebaorder');
    expect(mallIdFromHost('https://amoebaorder.cafe24.com/member/login.html')).toBe('amoebaorder');
    expect(mallIdFromHost('AmoebaOrder.Cafe24.com')).toBe('amoebaorder');
    expect(mallIdFromHost('amoebaorder')).toBe('amoebaorder');
  });

  it('does not invent a mall id for a custom domain', () => {
    // It must be null, not a guess: null means "cannot verify" and callers let
    // the install through with a warning, while a wrong guess would refuse it.
    expect(expectedMallIdForTenant({ shopDomain: 'shop.example.com' })).toBeNull();
    expect(expectedMallIdForTenant({ shopDomain: null, storefrontUrl: null })).toBeNull();
  });

  it('prefers whichever tenant field is a cafe24 host', () => {
    expect(
      expectedMallIdForTenant({ shopDomain: 'shop.example.com', storefrontUrl: 'https://annehearts.cafe24.com/' }),
    ).toBe('annehearts');
    // Tenant 2's stored domain carries protocol and a trailing slash — real data.
    expect(expectedMallIdForTenant({ shopDomain: 'https://annehearts.cafe24.com/' })).toBe('annehearts');
  });
});

describe('Cafe24TokenService.findTenantIdByMallId', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    // 32 zero bytes, base64 — the util only checks the length.
    process.env = { ...OLD_ENV, CRED_ENC_KEY: Buffer.alloc(32).toString('base64') };
  });
  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  function build(rows: Array<{ tenantId: number; mallId: string }>) {
    const credRepo = {
      find: jest.fn().mockResolvedValue(
        rows.map((r) => ({
          tenantId: r.tenantId,
          secretEnc: encryptSecret(JSON.stringify({ mallId: r.mallId, refreshToken: 'rt' })),
        })),
      ),
    };
    const svc = new Cafe24TokenService(credRepo as never);
    const error = jest.spyOn(svc['logger'], 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(svc['logger'], 'warn').mockImplementation(() => undefined);
    return { svc, error, warn };
  }

  it('resolves a mall with exactly one owner', async () => {
    const { svc } = build([{ tenantId: 2, mallId: 'annehearts' }]);
    await expect(svc.findTenantIdByMallId('annehearts')).resolves.toBe(2);
  });

  it('refuses to guess when two tenants claim the same mall', async () => {
    // This is the live staging state. The old code returned the first row it
    // reached, which would sign an annehearts shopper into whichever tenant the
    // scan happened to hit — an arbitrary merchant.
    const { svc, error } = build([
      { tenantId: 2, mallId: 'annehearts' },
      { tenantId: 3, mallId: 'annehearts' },
    ]);

    await expect(svc.findTenantIdByMallId('annehearts')).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('2, 3'));
  });

  it('says so when nobody owns the mall', async () => {
    const { svc, warn } = build([{ tenantId: 2, mallId: 'annehearts' }]);
    await expect(svc.findTenantIdByMallId('amoebaorder')).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('amoebaorder'));
  });
});

describe('Cafe24SyncService.syncOrders mall guard', () => {
  function build(tenant: { shopDomain?: string | null }, mallId: string) {
    const tokenService = {
      getConnection: jest.fn().mockResolvedValue({ mallId, accessToken: 'at' }),
    };
    const client = { pullOrders: jest.fn().mockResolvedValue([]) };
    const tenantService = { findById: jest.fn().mockResolvedValue(tenant) };
    const svc = new Cafe24SyncService(
      {} as never, // orderRepo
      {} as never, // itemRepo
      tokenService as never,
      client as never,
      {} as never, // customerService
      tenantService as never,
    );
    const error = jest.spyOn(svc['logger'], 'error').mockImplementation(() => undefined);
    return { svc, client, error };
  }

  it('refuses to pull a mall the tenant does not run on', async () => {
    const { svc, client, error } = build({ shopDomain: 'amoebaorder.cafe24.com' }, 'annehearts');

    const res = await svc.syncOrders(3);

    expect(res.ok).toBe(false);
    expect(res.synced).toBe(0);
    // Nothing was fetched — this is what stops the cache filling with another
    // merchant's orders, which is the damage that outlived the broken login.
    expect(client.pullOrders).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('annehearts'));
  });

  it('syncs normally when the mall matches', async () => {
    const { svc, client } = build({ shopDomain: 'annehearts.cafe24.com' }, 'annehearts');
    await svc.syncOrders(2);
    expect(client.pullOrders).toHaveBeenCalled();
  });

  it('syncs a custom-domain tenant, which cannot be checked', async () => {
    const { svc, client } = build({ shopDomain: 'shop.example.com' }, 'somemall');
    await svc.syncOrders(9);
    expect(client.pullOrders).toHaveBeenCalled();
  });
});
