import { verifyFulfillmentWebhookSecret } from './webhook-secret.util';

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
