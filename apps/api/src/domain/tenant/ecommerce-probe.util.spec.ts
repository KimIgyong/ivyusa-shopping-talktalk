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
