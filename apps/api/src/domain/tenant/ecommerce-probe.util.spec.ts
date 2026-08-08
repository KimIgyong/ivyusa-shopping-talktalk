import { probeEcommerce } from './ecommerce-probe.util';

/**
 * SSRF guard (SEC-M3): Woo/Odoo take a tenant-supplied URL. The probe must
 * reject non-https and any URL resolving to an internal address BEFORE fetch.
 * `fetch` is stubbed to throw so a leak (guard bypassed) surfaces as that error,
 * never a silent pass.
 */
describe('probeEcommerce SSRF guard', () => {
  const realFetch = global.fetch;
  beforeAll(() => {
    global.fetch = jest.fn(async () => {
      throw new Error('FETCH-REACHED');
    }) as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  const woo = (store_url: string) =>
    probeEcommerce('woocommerce', { store_url, consumer_key: 'ck', consumer_secret: 'cs' });

  it('blocks http (non-https) store URLs', async () => {
    const r = await woo('http://shop.example.com');
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/https/i);
  });

  it('blocks loopback', async () => {
    const r = await woo('https://127.0.0.1');
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Blocked/);
  });

  it('blocks the cloud metadata IP', async () => {
    const r = await woo('https://169.254.169.254');
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Blocked/);
  });

  it('blocks RFC-1918 private ranges', async () => {
    for (const host of ['https://10.0.0.5', 'https://192.168.1.10', 'https://172.16.0.9']) {
      const r = await woo(host);
      expect(r.ok).toBe(false);
      expect(r.detail).toMatch(/Blocked/);
    }
  });

  it('blocks IPv6 loopback and ULA', async () => {
    for (const host of ['https://[::1]', 'https://[fd00::1]']) {
      const r = await woo(host);
      expect(r.ok).toBe(false);
      expect(r.detail).toMatch(/Blocked/);
    }
  });

  it('blocks CGNAT (100.64/10)', async () => {
    const r = await woo('https://100.64.1.1');
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Blocked/);
  });

  it('allows a public IP through to the fetch (guard passes)', async () => {
    // 93.184.216.34 (example.com) is public — guard passes, stubbed fetch throws.
    const r = await woo('https://93.184.216.34');
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/FETCH-REACHED/);
  });

  it('rejects the Odoo URL too', async () => {
    const r = await probeEcommerce('odoo', {
      url: 'https://192.168.0.1',
      db: 'd',
      username: 'u',
      api_key: 'k',
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Blocked/);
  });
});

/**
 * Marketing/helpdesk probes (PLN-260808): vendor-pinned domains, never-throw,
 * missing-credential short-circuit before any fetch.
 */
describe('probeEcommerce marketing/helpdesk providers', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('short-circuits on missing credentials without fetching', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('FETCH-REACHED');
    }) as unknown as typeof fetch;
    for (const [provider, config] of [
      ['klaviyo', {}],
      ['yotpo', { app_key: 'a' }], // secret missing
      ['gorgias', { subdomain: 's', email: 'e@x.com' }], // key missing
    ] as const) {
      const r = await probeEcommerce(provider, config as Record<string, string>);
      expect(r.ok).toBe(false);
      expect(r.detail).toMatch(/missing/i);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('klaviyo: 200 → connected with the required revision header', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await probeEcommerce('klaviyo', { api_key: 'pk_test' });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('a.klaviyo.com/api/accounts');
    expect((init.headers as Record<string, string>).revision).toBeTruthy();
  });

  it('yotpo: token in the response body proves the pair; no token = rejected', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'tok' }),
    })) as unknown as typeof fetch;
    await expect(
      probeEcommerce('yotpo', { app_key: 'a', secret_key: 's' }),
    ).resolves.toMatchObject({ ok: true });

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      probeEcommerce('yotpo', { app_key: 'a', secret_key: 'bad' }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('gorgias: pins to the vendor domain and maps 401 to invalid credentials', async () => {
    const fetchMock = jest.fn(async () => ({ ok: false, status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await probeEcommerce('gorgias', {
      subdomain: 'https://acme.gorgias.com/extra', // normalizes to bare subdomain
      email: 'agent@acme.com',
      api_key: 'key',
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/invalid/i);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://acme.gorgias.com/api/account');
  });
});
