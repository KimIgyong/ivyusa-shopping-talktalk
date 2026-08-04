import { WidgetLoginMode } from '@ivy/types';

/** Response DTOs — camelCase. `uuid` is the external tenant identifier. */
export interface TenantResponse {
  id: number;
  uuid: string;
  shopDomain: string;
  slug: string;
  name: string | null;
  status: string;
  plan: string | null;
  userCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Display-safe subset served to the unauthenticated per-tenant login page. */
export interface PublicTenantResponse {
  slug: string;
  name: string | null;
  status: string;
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
 * Tenant privacy-notice settings (PLN-Privacy-Control-Gap Stage 2). Stored
 * values as configured — null means "unset, platform default applies".
 */
export interface PrivacyNoticeResponse {
  privacyPolicyUrl: string | null;
  consentNoticeVersion: string | null;
}

/** Widget behavior settings (PLN-Widget-Login-Redirect-Orders). */
/** Customer-facing shop origin; null disables product links in the widget. */
export interface StorefrontResponse {
  storefrontUrl: string | null;
}

export interface WidgetSettingsResponse {
  loginMode: WidgetLoginMode;
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
