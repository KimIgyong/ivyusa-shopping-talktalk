import * as crypto from 'crypto';
import { verifyShopifyHmac, verifyShopifyQueryHmac } from './shopify-hmac.util';

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

/** verifyShopifyHmac — webhook body signature (SEC-C1: must fail closed). */
describe('verifyShopifyHmac', () => {
  const WEBHOOK_SECRET = 'wh-secret';
  const body = Buffer.from(JSON.stringify({ shop_domain: 'x.myshopify.com' }));
  const validHmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('base64');

  const origSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.SHOPIFY_WEBHOOK_SECRET = origSecret;
    process.env.NODE_ENV = origEnv;
  });

  it('accepts a correctly signed webhook', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    expect(() => verifyShopifyHmac(body, undefined, validHmac)).not.toThrow();
  });

  it('rejects a tampered/invalid signature', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    expect(() => verifyShopifyHmac(body, undefined, 'wrong')).toThrow();
  });

  it('fails CLOSED when the secret is unset outside development', () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => verifyShopifyHmac(body, undefined, validHmac)).toThrow();
  });

  it('allows unverified only in development when the secret is unset', () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';
    expect(() => verifyShopifyHmac(body, undefined, undefined)).not.toThrow();
  });
});
