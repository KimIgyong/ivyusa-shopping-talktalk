/** Response DTOs — camelCase. */
export interface TenantResponse {
  id: number;
  shopDomain: string;
  name: string | null;
  status: string;
  plan: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Credential status only — secret material is NEVER exposed. */
export interface CredentialResponse {
  provider: string;
  status: string;
  configured: boolean;
  updatedAt: Date | null;
}

/** Shopify connection settings view — secrets are never exposed (only flags). */
export interface ShopifySettingsResponse {
  shopDomain: string;
  name: string | null;
  status: string;
  credential: {
    configured: boolean;
    updatedAt: Date | null;
  };
  integration: {
    status: string | null;
    lastSyncAt: Date | null;
    detail: string | null;
  };
}

/** Result of a Shopify Admin API connectivity test. */
export interface ShopifyTestResponse {
  ok: boolean;
  detail: string;
}

/**
 * Generic e-commerce integration settings view. `fields` holds the non-secret
 * credential values (echoed back); `secrets` maps each secret field key to whether
 * it is currently stored (the value itself is never returned).
 */
export interface IntegrationSettingsResponse {
  provider: string;
  fields: Record<string, string | null>;
  secrets: Record<string, boolean>;
  credential: {
    configured: boolean;
    updatedAt: Date | null;
  };
  integration: {
    status: string | null;
    lastSyncAt: Date | null;
    detail: string | null;
  };
}

/** Result of a generic e-commerce integration connectivity test. */
export interface IntegrationTestResponse {
  ok: boolean;
  detail: string;
}
