import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api-client';
import type { WidgetLoginMode } from '@ivy/types';

export interface CredentialStatus {
  provider: string;
  configured: boolean;
  lastUpdatedAt?: string;
  maskedKey?: string;
}

export interface UpdateCredentialBody {
  apiKey?: string;
  secret?: string;
  [k: string]: unknown;
}

export interface ShopifySettings {
  shopDomain: string;
  name: string | null;
  status: string;
  credential: { configured: boolean; updatedAt: string | null };
  integration: { status: string | null; lastSyncAt: string | null; detail: string | null };
}

export interface SaveShopifyBody {
  shop_domain: string;
  name?: string;
  access_token?: string;
  api_key?: string;
  api_secret?: string;
}

export interface ShopifyTestResult {
  ok: boolean;
  detail: string;
}

export interface ShopifySyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

export interface ShopifyWebhookRegisterResult {
  ok: boolean;
  registered: number;
  existing: number;
  failed: number;
  detail: string;
}

/** Generic e-commerce integration settings (cafe24 / woocommerce / odoo / haravan). */
export interface IntegrationSettings {
  provider: string;
  fields: Record<string, string | null>;
  secrets: Record<string, boolean>;
  credential: { configured: boolean; updatedAt: string | null };
  integration: { status: string | null; lastSyncAt: string | null; detail: string | null };
}

export interface IntegrationTestResult {
  ok: boolean;
  detail: string;
}

/** Widget behavior settings (sign-in mode) — tenant-scoped. */
/** Customer-facing shop origin; null means product links stay off. */
export interface Storefront {
  storefrontUrl: string | null;
}

export interface WidgetSettings {
  loginMode: WidgetLoginMode;
  timezone: string | null;
}

export const settingsService = {
  credentials: () => apiGet<CredentialStatus[]>('/tenants/me/credentials'),
  widgetSettings: () => apiGet<WidgetSettings>('/tenants/widget-settings'),
  storefront: () => apiGet<Storefront>('/tenants/storefront'),
  updateStorefront: (storefrontUrl: string) =>
    apiPatch<Storefront>('/tenants/storefront', { storefront_url: storefrontUrl }),
  saveWidgetSettings: (loginMode: WidgetLoginMode, timezone?: string | null) =>
    apiPatch<WidgetSettings>('/tenants/widget-settings', {
      login_mode: loginMode,
      ...(timezone !== undefined ? { timezone } : {}),
    }),
  updateCredential: (provider: string, body: UpdateCredentialBody) =>
    apiPut<CredentialStatus>(`/tenants/me/credentials/${provider}`, body),
  shopify: () => apiGet<ShopifySettings>('/tenants/me/shopify'),
  saveShopify: (body: SaveShopifyBody) => apiPut<ShopifySettings>('/tenants/me/shopify', body),
  testShopify: () => apiPost<ShopifyTestResult>('/tenants/me/shopify/test'),
  syncShopify: () => apiPost<ShopifySyncResult>('/tenants/me/shopify/sync'),
  registerShopifyWebhooks: () =>
    apiPost<ShopifyWebhookRegisterResult>('/tenants/me/shopify/register-webhooks'),
  integration: (provider: string) =>
    apiGet<IntegrationSettings>(`/tenants/me/integrations/${provider}`),
  saveIntegration: (provider: string, config: Record<string, string>) =>
    apiPut<IntegrationSettings>(`/tenants/me/integrations/${provider}`, { config }),
  testIntegration: (provider: string) =>
    apiPost<IntegrationTestResult>(`/tenants/me/integrations/${provider}/test`),
  // Cafe24 OAuth (PLN-260807 P-A1): begin the flow (returns the authorize URL the
  // browser navigates to) and run an on-demand order sync.
  connectCafe24: (mallId: string) =>
    apiPost<{ authorizeUrl: string }>('/tenants/me/cafe24/connect', { mall_id: mallId }),
  syncCafe24: () => apiPost<Cafe24SyncResult>('/tenants/me/cafe24/sync'),
  // Catalogue pull (PLN-260808-Cafe24-Product-Knowledge). Fills products_cache;
  // turning those rows into knowledge stays a separate, previewed step.
  syncCafe24Products: () =>
    apiPost<Cafe24ProductSyncResult>('/tenants/me/cafe24/products/sync'),
};

export interface Cafe24SyncResult {
  ok: boolean;
  synced: number;
  detail: string;
}

export interface Cafe24ProductSyncResult extends Cafe24SyncResult {
  archived: number;
}
