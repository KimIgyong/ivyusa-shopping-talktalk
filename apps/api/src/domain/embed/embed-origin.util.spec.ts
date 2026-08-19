import { defaultOrigins, isOriginAllowed, originMatches, parseOrigin } from './embed-origin.util';

/**
 * Embed allowlist (PLN-260819 S1). The rules that matter are the ones that
 * decide whether a live storefront keeps working, so most of these are about
 * NOT locking someone out by accident.
 */
describe('parseOrigin', () => {
  it('accepts what an operator actually pastes', () => {
    expect(parseOrigin('shop.myshopify.com')).toEqual({
      scheme: 'https',
      host: 'shop.myshopify.com',
      port: '',
    });
    expect(parseOrigin('https://www.ivyusa.com/pages/contact')).toEqual({
      scheme: 'https',
      host: 'www.ivyusa.com',
      port: '',
    });
    expect(parseOrigin('http://localhost:5174')).toEqual({
      scheme: 'http',
      host: 'localhost',
      port: '5174',
    });
  });

  it('refuses anything that is not http(s)', () => {
    expect(parseOrigin('javascript:alert(1)')).toBeNull();
    expect(parseOrigin('file:///etc/passwd')).toBeNull();
    expect(parseOrigin('')).toBeNull();
    expect(parseOrigin(null)).toBeNull();
  });
});

describe('originMatches', () => {
  const origin = parseOrigin('https://www.ivyusa.com')!;

  it('matches an exact origin', () => {
    expect(originMatches('https://www.ivyusa.com', origin)).toBe(true);
    expect(originMatches('www.ivyusa.com', origin)).toBe(true);
  });

  it('does not match across schemes', () => {
    expect(originMatches('http://www.ivyusa.com', origin)).toBe(false);
  });

  it('does not match a different host that merely ends the same', () => {
    // The classic allowlist bug: "notivyusa.com" must not pass "ivyusa.com".
    expect(originMatches('https://ivyusa.com', parseOrigin('https://notivyusa.com')!)).toBe(false);
  });

  it('matches subdomains under a wildcard, but not the apex', () => {
    expect(originMatches('https://*.ivyusa.com', origin)).toBe(true);
    expect(originMatches('https://*.ivyusa.com', parseOrigin('https://shop.eu.ivyusa.com')!)).toBe(
      true,
    );
    // Listing "*.x" and expecting "x" to be covered is the surprise this avoids.
    expect(originMatches('https://*.ivyusa.com', parseOrigin('https://ivyusa.com')!)).toBe(false);
  });

  it('ignores the port unless the pattern names one', () => {
    const dev = parseOrigin('http://localhost:5174')!;
    expect(originMatches('http://localhost', dev)).toBe(true);
    expect(originMatches('http://localhost:5174', dev)).toBe(true);
    expect(originMatches('http://localhost:3000', dev)).toBe(false);
  });
});

describe('defaultOrigins', () => {
  it('derives the tenant’s own storefront', () => {
    expect(
      defaultOrigins({ shopDomain: 'ivyusa.myshopify.com', storefrontUrl: 'https://www.ivyusa.com' }),
    ).toEqual(['https://ivyusa.myshopify.com', 'https://www.ivyusa.com']);
  });

  it('drops unusable values instead of inventing entries', () => {
    expect(defaultOrigins({ shopDomain: null, storefrontUrl: 'not a url at all' })).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  const tenant = { shopDomain: 'amoebaorder.cafe24.com', storefrontUrl: null };

  it('falls back to the storefront when nothing is configured', () => {
    expect(isOriginAllowed('https://amoebaorder.cafe24.com', null, tenant)).toBe(true);
    expect(isOriginAllowed('https://someone-else.com', null, tenant)).toBe(false);
  });

  it('uses the configured list once there is one', () => {
    const list = ['https://www.go2joy.vn', 'https://*.go2joy.vn'];
    expect(isOriginAllowed('https://www.go2joy.vn', list, tenant)).toBe(true);
    expect(isOriginAllowed('https://m.go2joy.vn', list, tenant)).toBe(true);
    // The configured list REPLACES the default — the storefront is no longer
    // implicitly allowed, which is what makes the setting meaningful.
    expect(isOriginAllowed('https://amoebaorder.cafe24.com', list, tenant)).toBe(false);
  });

  it('allows everything when the tenant has no storefront on record', () => {
    // Refusing here would take the widget offline for a tenant that never
    // filled in a domain — a worse failure than a missing guard.
    expect(
      isOriginAllowed('https://anything.example', null, { shopDomain: null, storefrontUrl: null }),
    ).toBe(true);
  });

  it('refuses an unparseable origin', () => {
    expect(isOriginAllowed('', null, tenant)).toBe(false);
    expect(isOriginAllowed(undefined, null, tenant)).toBe(false);
  });
});
