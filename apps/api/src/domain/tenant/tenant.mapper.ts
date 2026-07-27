import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { IntegrationStatusEntity } from '../integration/entity/integration-status.entity';
import {
  CredentialResponse,
  PublicTenantResponse,
  ShopifySettingsResponse,
  TenantResponse,
} from './dto/response/tenant.response';

/** Entity -> response mapping. Keeps secrets out of API payloads. */
export class TenantMapper {
  static toTenant(t: Tenant, userCount?: number): TenantResponse {
    return {
      id: t.id,
      shopDomain: t.shopDomain,
      slug: t.slug,
      name: t.name,
      status: t.status,
      plan: t.plan,
      ...(userCount !== undefined ? { userCount } : {}),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  static toTenantList(tenants: Tenant[], counts?: Map<number, number>): TenantResponse[] {
    return tenants.map((t) => this.toTenant(t, counts?.get(Number(t.id)) ?? (counts ? 0 : undefined)));
  }

  /** Unauthenticated login-page view — never add fields beyond display-safe ones. */
  static toPublicTenant(t: Tenant): PublicTenantResponse {
    return { slug: t.slug, name: t.name, status: t.status };
  }

  static toCredential(c: IntegrationCredential): CredentialResponse {
    return {
      provider: c.provider,
      status: c.status,
      configured: c.secretEnc != null,
      updatedAt: c.updatedAt ?? null,
    };
  }

  static toCredentialList(creds: IntegrationCredential[]): CredentialResponse[] {
    return creds.map((c) => this.toCredential(c));
  }

  static toShopifySettings(
    tenant: Tenant,
    cred: IntegrationCredential | null,
    status: IntegrationStatusEntity | null,
  ): ShopifySettingsResponse {
    return {
      shopDomain: tenant.shopDomain,
      name: tenant.name,
      status: tenant.status,
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
