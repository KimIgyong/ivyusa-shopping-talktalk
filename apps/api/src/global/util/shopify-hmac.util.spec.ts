import * as crypto from 'crypto';
import { verifyShopifyQueryHmac } from './shopify-hmac.util';

/** verifyShopifyQueryHmac — Shopify OAuth callback query signature. */
describe('verifyShopifyQueryHmac', () => {
  const secret = 'shhh';

  function sign(params: Record<string, string>): string {
    const message = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  it('accepts a correctly signed query', () => {
    const params = { code: 'abc', shop: 'x.myshopify.com', state: 'n1', timestamp: '123' };
    const query = { ...params, hmac: sign(params) };
    expect(verifyShopifyQueryHmac(query, secret)).toBe(true);
  });

  it('rejects a tampered query', () => {
    const params = { code: 'abc', shop: 'x.myshopify.com', state: 'n1', timestamp: '123' };
    const query = { ...params, hmac: sign(params), shop: 'evil.myshopify.com' };
    expect(verifyShopifyQueryHmac(query, secret)).toBe(false);
  });

  it('rejects a missing hmac', () => {
    expect(verifyShopifyQueryHmac({ shop: 'x.myshopify.com' }, secret)).toBe(false);
  });

  it('ignores hmac/signature keys when building the message', () => {
    const params = { code: 'abc', shop: 'x.myshopify.com' };
    const query = { ...params, signature: 'ignored', hmac: sign(params) };
    expect(verifyShopifyQueryHmac(query, secret)).toBe(true);
  });
});
