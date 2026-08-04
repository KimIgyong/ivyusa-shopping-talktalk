import { isStorefrontUrl, normalizeStorefrontUrl, productLinkFor } from './storefront-url.util';

describe('normalizeStorefrontUrl', () => {
  it('keeps a well-formed origin', () => {
    expect(normalizeStorefrontUrl('https://ivyusa.com')).toBe('https://ivyusa.com');
  });

  it('adds https to a bare host, which is what an operator types', () => {
    expect(normalizeStorefrontUrl('ivyusa.com')).toBe('https://ivyusa.com');
  });

  it('drops path, query and fragment', () => {
    // Keeping "/collections/all" would break every later comparison.
    expect(normalizeStorefrontUrl('https://ivyusa.com/collections/all?page=2#top')).toBe(
      'https://ivyusa.com',
    );
  });

  it('rejects empty and unusable input', () => {
    for (const v of [null, undefined, '', '   ', 'not a url at all!!']) {
      expect(normalizeStorefrontUrl(v)).toBeNull();
    }
  });

  it('rejects a non-http scheme', () => {
    expect(normalizeStorefrontUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeStorefrontUrl('ftp://ivyusa.com')).toBeNull();
  });
});

describe('isStorefrontUrl', () => {
  const store = 'https://ivyusa.com';

  it('accepts the tenant’s own product page', () => {
    expect(isStorefrontUrl('https://ivyusa.com/products/super-collagen-mask', store)).toBe(true);
  });

  it('treats www as the same site', () => {
    expect(isStorefrontUrl('https://www.ivyusa.com/products/x', store)).toBe(true);
    expect(isStorefrontUrl('https://ivyusa.com/products/x', 'https://www.ivyusa.com')).toBe(true);
  });

  it('rejects a different subdomain', () => {
    // Accepting any subdomain would let one an attacker controls through and
    // defeat the check entirely.
    expect(isStorefrontUrl('https://shop.ivyusa.com/products/x', store)).toBe(false);
  });

  it('rejects an outright foreign host', () => {
    // The case that matters: source_url arrives in an uploaded CSV and the
    // widget renders it to customers.
    expect(isStorefrontUrl('https://evil.example/pwned', store)).toBe(false);
  });

  it('rejects a host that merely ends with the storefront name', () => {
    expect(isStorefrontUrl('https://notivyusa.com/products/x', store)).toBe(false);
    expect(isStorefrontUrl('https://ivyusa.com.evil.example/x', store)).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isStorefrontUrl('javascript:alert(1)', store)).toBe(false);
  });

  it('rejects everything when the tenant has no storefront configured', () => {
    // Safe default: with no origin recorded, nothing can be verified.
    expect(isStorefrontUrl('https://ivyusa.com/products/x', null)).toBe(false);
  });

  it('rejects a missing candidate', () => {
    expect(isStorefrontUrl(null, store)).toBe(false);
  });
});

describe('productLinkFor', () => {
  const store = 'https://ivyusa.com';

  it('links a product document on the storefront', () => {
    expect(productLinkFor('product', 'https://ivyusa.com/products/x', store)).toBe(
      'https://ivyusa.com/products/x',
    );
  });

  it('never links a counsel document, even with a valid URL', () => {
    // A policy page is not a product recommendation.
    expect(productLinkFor('counsel', 'https://ivyusa.com/pages/returns', store)).toBeNull();
  });

  it('returns null for a product whose URL is off-storefront', () => {
    expect(productLinkFor('product', 'https://evil.example/x', store)).toBeNull();
  });

  it('returns null when the storefront is unset', () => {
    expect(productLinkFor('product', 'https://ivyusa.com/products/x', null)).toBeNull();
  });
});
