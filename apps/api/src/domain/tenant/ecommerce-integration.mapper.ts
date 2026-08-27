import { GenericIntegrationProvider, INTEGRATION_FIELDS } from '@ivy/types';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { IntegrationSettingsResponse } from './dto/response/tenant.response';

/** Shapes the generic integration settings view. Secret values are never returned. */
export class EcommerceIntegrationMapper {
  static toSettings(
    provider: GenericIntegrationProvider,
    config: Record<string, string>,
    cred: IntegrationCredential | null,
  ): IntegrationSettingsResponse {
    const fields: Record<string, string | null> = {};
    const secrets: Record<string, boolean> = {};
    for (const spec of INTEGRATION_FIELDS[provider]) {
      if (spec.secret) {
        secrets[spec.key] = !!(config[spec.key] && String(config[spec.key]).trim());
      } else {
        fields[spec.key] = config[spec.key] ?? null;
      }
    }
    return {
      provider,
      fields,
      secrets,
      credential: {
        configured: cred?.secretEnc != null,
        updatedAt: cred?.updatedAt ?? null,
      },
      // Per-tenant connection state — 'connected' only after a real test
      // (FIX-260827); a saved-but-untested credential is 'unknown'.
      integration: {
        status: cred?.status ?? null,
        lastSyncAt: cred?.lastTestedAt ?? null,
        detail: cred?.detail ?? null,
      },
    };
  }
}
