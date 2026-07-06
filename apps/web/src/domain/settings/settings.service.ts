import { apiGet, apiPost, apiPut } from '@/lib/api-client';

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

export const settingsService = {
  credentials: () => apiGet<CredentialStatus[]>('/tenants/me/credentials'),
  updateCredential: (provider: string, body: UpdateCredentialBody) =>
    apiPut<CredentialStatus>(`/tenants/me/credentials/${provider}`, body),
  shopify: () => apiGet<ShopifySettings>('/tenants/me/shopify'),
  saveShopify: (body: SaveShopifyBody) => apiPut<ShopifySettings>('/tenants/me/shopify', body),
  testShopify: () => apiPost<ShopifyTestResult>('/tenants/me/shopify/test'),
  syncShopify: () => apiPost<ShopifySyncResult>('/tenants/me/shopify/sync'),
};
