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
