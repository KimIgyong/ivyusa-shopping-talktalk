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
