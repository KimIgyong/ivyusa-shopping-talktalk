import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { CredentialResponse, TenantResponse } from './dto/response/tenant.response';

/** Entity -> response mapping. Keeps secrets out of API payloads. */
export class TenantMapper {
  static toTenant(t: Tenant): TenantResponse {
    return {
      id: t.id,
      shopDomain: t.shopDomain,
      name: t.name,
      status: t.status,
      plan: t.plan,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  static toTenantList(tenants: Tenant[]): TenantResponse[] {
    return tenants.map((t) => this.toTenant(t));
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
}
