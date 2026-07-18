import { WebhookSecretService } from './webhook-secret.service';

// Stub the crypto layer so the test does not need a real CRED_ENC_KEY.
jest.mock('../../global/util/crypto.util', () => ({
  decryptSecret: (buf: Buffer) => buf.toString('utf8'),
}));

/** WebhookSecretService.resolve — per-tenant stored secret with env fallback. */
describe('WebhookSecretService', () => {
  const origEnv = { ...process.env };
  let findOne: jest.Mock;
  let service: WebhookSecretService;

  const cred = (config: Record<string, string>) => ({
    secretEnc: Buffer.from(JSON.stringify(config), 'utf8'),
  });

  beforeEach(() => {
    findOne = jest.fn();
    service = new WebhookSecretService({ findOne } as never);
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns the per-tenant stored webhook_secret when present', async () => {
    findOne.mockResolvedValue(cred({ webhook_secret: 'tenant-secret', store_url: 'https://x' }));
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'env-secret';
    await expect(service.resolve('fulfillment', 1)).resolves.toBe('tenant-secret');
  });

  it('falls back to the env secret when no per-tenant secret is stored', async () => {
    findOne.mockResolvedValue(null);
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'env-secret';
    await expect(service.resolve('fulfillment', 1)).resolves.toBe('env-secret');
  });

  it('uses the env fallback for a null tenant (no DB lookup)', async () => {
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'env-secret';
    await expect(service.resolve('fulfillment', null)).resolves.toBe('env-secret');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('returns undefined for a provider with no stored secret and no env fallback', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.resolve('cafe24', 1)).resolves.toBeUndefined();
  });

  it('ignores a blank stored webhook_secret and falls back to env', async () => {
    findOne.mockResolvedValue(cred({ webhook_secret: '   ' }));
    process.env.FULFILLMENT_WEBHOOK_SECRET = 'env-secret';
    await expect(service.resolve('fulfillment', 1)).resolves.toBe('env-secret');
  });
});
