import { EcommerceProvider, INTEGRATION_FIELDS } from '@ivy/types';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { IntegrationStatusEntity } from '../integration/entity/integration-status.entity';
import { IntegrationSettingsResponse } from './dto/response/tenant.response';

/** Shapes the generic integration settings view. Secret values are never returned. */
export class EcommerceIntegrationMapper {
  static toSettings(
    provider: EcommerceProvider,
    config: Record<string, string>,
    cred: IntegrationCredential | null,
    status: IntegrationStatusEntity | null,
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
      integration: {
        status: status?.status ?? null,
        lastSyncAt: status?.lastSyncAt ?? null,
        detail: status?.detail ?? null,
      },
    };
  }
}
