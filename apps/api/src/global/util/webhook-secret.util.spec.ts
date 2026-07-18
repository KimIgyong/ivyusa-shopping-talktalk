import { assertWebhookSecret, verifyFulfillmentWebhookSecret } from './webhook-secret.util';

/** assertWebhookSecret — pure compare against a caller-resolved expected secret. */
describe('assertWebhookSecret', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  it('accepts when provided matches expected', () => {
    expect(() => assertWebhookSecret('abc', 'abc')).not.toThrow();
  });

  it('rejects when provided differs from expected', () => {
    expect(() => assertWebhookSecret('abc', 'xyz')).toThrow();
  });

  it('rejects a missing provided value against a real expected', () => {
    expect(() => assertWebhookSecret(undefined, 'abc')).toThrow();
  });

  it('fails CLOSED when expected is empty outside development', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertWebhookSecret('abc', undefined)).toThrow();
  });

  it('allows unverified only in development when expected is empty', () => {
    process.env.NODE_ENV = 'development';
    expect(() => assertWebhookSecret(undefined, undefined)).not.toThrow();
  });
});

/** verifyFulfillmentWebhookSecret — shared-secret header (SEC-C2: fail closed). */
describe('verifyFulfillmentWebhookSecret', () => {
  const origSecret = process.env.FULFILLMENT_WEBHOOK_SECRET;
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.FULFILLMENT_WEBHOOK_SECRET = origSecret;
    process.env.NODE_ENV = origEnv;
  });

  it('accepts a matching secret', () => {
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'topsecret';
    expect(() => verifyFulfillmentWebhookSecret('topsecret')).not.toThrow();
  });

  it('rejects a wrong secret', () => {
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'topsecret';
    expect(() => verifyFulfillmentWebhookSecret('nope')).toThrow();
  });

  it('rejects a missing header', () => {
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'topsecret';
    expect(() => verifyFulfillmentWebhookSecret(undefined)).toThrow();
  });

  it('fails CLOSED when the secret is unset outside development', () => {
    delete process.env.FULFILLMENT_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => verifyFulfillmentWebhookSecret('anything')).toThrow();
  });

  it('allows unverified only in development when the secret is unset', () => {
    delete process.env.FULFILLMENT_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'development';
    expect(() => verifyFulfillmentWebhookSecret(undefined)).not.toThrow();
  });
});
