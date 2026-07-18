import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INTEGRATION_PROVIDER } from '@ivy/types';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { decryptSecret } from '../../global/util/crypto.util';

/** Global env fallback per provider (app-level secrets that are not per-tenant). */
const ENV_FALLBACK: Record<string, string | undefined> = {
  [INTEGRATION_PROVIDER.FULFILLMENT]: 'FULFILLMENT_WEBHOOK_SECRET',
  [INTEGRATION_PROVIDER.SHOPIFY]: 'SHOPIFY_WEBHOOK_SECRET',
};

/**
 * Resolves the webhook-signing secret for a provider's inbound webhooks.
 *
 * Precedence: a per-tenant `webhook_secret` stored (encrypted) in
 * `integration_credentials` wins; otherwise the global env fallback. This lets
 * non-Shopify commerce platforms (cafe24 / woocommerce / odoo / haravan), where
 * each store has its own secret, be verified per tenant — while app-level secrets
 * (Shopify, or a shared fulfillment secret) keep working from env.
 */
@Injectable()
export class WebhookSecretService {
  private readonly logger = new Logger(WebhookSecretService.name);

  constructor(
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
  ) {}

  /** Expected secret for (provider, tenant): per-tenant stored value, else env. */
  async resolve(provider: string, tenantId: number | null): Promise<string | undefined> {
    if (tenantId != null) {
      const stored = await this.storedWebhookSecret(provider, tenantId);
      if (stored) return stored;
    }
    const envVar = ENV_FALLBACK[provider];
    return envVar ? process.env[envVar] || undefined : undefined;
  }

  private async storedWebhookSecret(provider: string, tenantId: number): Promise<string | undefined> {
    const cred = await this.credRepo.findOne({ where: { tenantId, provider } });
    if (!cred?.secretEnc) return undefined;
    try {
      const parsed = JSON.parse(decryptSecret(cred.secretEnc)) as unknown;
      if (parsed && typeof parsed === 'object') {
        const value = (parsed as Record<string, unknown>).webhook_secret;
        if (typeof value === 'string' && value.trim() !== '') return value;
      }
    } catch (err) {
      // A decrypt/parse failure must not fall through to "no secret" and then
      // fail open in dev — log and let the env fallback decide.
      this.logger.warn(`webhook_secret decode failed for tenant=${tenantId} provider=${provider}`);
    }
    return undefined;
  }
}
