import { EcommerceIntegrationService } from './ecommerce-integration.service';

/**
 * FIX-260827 — connection state is per-tenant and test-gated: saving a credential
 * leaves it 'unknown', only a passing test makes it 'connected', and getSettings
 * reads the tenant's own credential (never a global provider status).
 */
describe('EcommerceIntegrationService — per-tenant, test-gated status', () => {
  beforeAll(() => {
    const crypto = require('../../global/util/crypto.util');
    jest.spyOn(crypto, 'encryptSecret').mockImplementation(() => Buffer.from('enc'));
    jest.spyOn(crypto, 'decryptSecret').mockImplementation(() => '{}');
  });
  afterAll(() => jest.restoreAllMocks());

  function build(existing: Record<string, unknown> | null) {
    const saved: Record<string, unknown>[] = [];
    const credRepo = {
      findOne: jest.fn(async () => existing),
      create: (r: Record<string, unknown>) => r,
      save: jest.fn(async (r: Record<string, unknown>) => { saved.push(r); return r; }),
    };
    const integrationService = { upsert: jest.fn(), findByName: jest.fn() };
    const svc = new EcommerceIntegrationService(credRepo as never, integrationService as never);
    return { svc, saved, credRepo, integrationService };
  }

  it('save() leaves a new credential unverified (status "unknown", not connected)', async () => {
    const { svc, saved } = build(null);
    await svc.save(1, 'odoo', { url: 'https://x', db: 'd', username: 'u', api_key: 'k' });
    expect(saved[0].status).toBe('unknown');
  });

  it('save() on an existing credential resets it to unknown + clears prior test', async () => {
    const existing = { status: 'connected', detail: 'was ok', lastTestedAt: new Date(), secretEnc: Buffer.from('e') };
    const { svc, saved } = build(existing);
    await svc.save(1, 'odoo', { url: 'https://y' });
    const row = saved[0];
    expect(row.status).toBe('unknown');
    expect(row.detail).toBeNull();
    expect(row.lastTestedAt).toBeNull();
  });

  it('test() sets the tenant credential status from the probe result, never a global row', async () => {
    const existing = { status: 'unknown', secretEnc: Buffer.from('e'), detail: null, lastTestedAt: null };
    const probe = require('./ecommerce-probe.util');
    const spy = jest.spyOn(probe, 'probeEcommerce').mockResolvedValue({ ok: true, detail: 'Connected' });
    const { svc, saved, integrationService } = build(existing);
    const res = await svc.test(1, 'odoo');
    expect(res.ok).toBe(true);
    expect(saved[0].status).toBe('connected');
    expect(saved[0].detail).toBe('Connected');
    expect(saved[0].lastTestedAt).toBeInstanceOf(Date);
    // No global integration_status write — that table would leak across tenants.
    expect(integrationService.upsert).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('test() records an error status when the probe fails', async () => {
    const existing = { status: 'unknown', secretEnc: Buffer.from('e') };
    const probe = require('./ecommerce-probe.util');
    const spy = jest.spyOn(probe, 'probeEcommerce').mockResolvedValue({ ok: false, detail: 'Odoo returned 401' });
    const { svc, saved } = build(existing);
    await svc.test(1, 'odoo');
    expect(saved[0].status).toBe('error');
    expect(saved[0].detail).toBe('Odoo returned 401');
    spy.mockRestore();
  });

  it('getSettings() reports "unknown" for a tenant with no credential (not a global connected)', async () => {
    const { svc, integrationService } = build(null);
    const res = await svc.getSettings(1, 'cafe24');
    expect(res.integration.status).toBeNull();
    expect(res.credential.configured).toBe(false);
    // never consults the global provider status
    expect(integrationService.findByName).not.toHaveBeenCalled();
  });
});
