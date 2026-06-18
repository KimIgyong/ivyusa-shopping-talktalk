import { apiGet, apiPut } from '@/lib/api-client';

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

export const settingsService = {
  credentials: () => apiGet<CredentialStatus[]>('/tenants/me/credentials'),
  updateCredential: (provider: string, body: UpdateCredentialBody) =>
    apiPut<CredentialStatus>(`/tenants/me/credentials/${provider}`, body),
};
