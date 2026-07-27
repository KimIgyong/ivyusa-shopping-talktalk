import { apiGet, apiGetList, apiPost, apiPatch } from '@/lib/api-client';
import type {
  InviteResult,
  InviteUserBody,
  JobLabel,
  TempPasswordResult,
  TenantUser,
} from '@/domain/users/users.service';

export interface Tenant {
  id: string;
  name: string;
  slug?: string;
  shopDomain?: string;
  plan?: string;
  status?: string;
  userCount?: number;
  createdAt?: string;
}

export interface AiEngine {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  enabled: boolean; // derived from backend `status`
  hasKey?: boolean;
  isDefault?: boolean;
  createdAt?: string;
}

// Raw backend catalog entry (AiEngineMapper.toEngine).
interface BackendEngine {
  id: number | string;
  provider?: string;
  name: string;
  model?: string;
  hasKey?: boolean;
  status?: string;
  isDefault?: number;
  createdAt?: string;
}

export interface AuditEntry {
  id: string;
  actor?: string;
  action: string;
  target?: string;
  ip?: string;
  createdAt?: string;
}

export const adminService = {
  tenants: (params: { page: number; pageSize: number }) =>
    apiGetList<Tenant>('/tenants', { page: params.page, size: params.pageSize }),
  tenant: (id: string) => apiGet<Tenant>(`/tenants/${id}`),
  // Backend expects snake_case shop_domain; slug is optional (server derives from name).
  createTenant: (body: { name: string; shopDomain: string; plan: string; slug?: string }) =>
    apiPost<Tenant>('/tenants', {
      name: body.name,
      shop_domain: body.shopDomain,
      plan: body.plan,
      ...(body.slug ? { slug: body.slug } : {}),
    }),
  setTenantStatus: (id: string, status: string) =>
    apiPatch<Tenant>(`/tenants/${id}/status`, { status }),
  // ---- Admin-scoped per-tenant user management ----
  tenantUsers: (tenantId: string, params: { page: number; pageSize: number }) =>
    apiGetList<TenantUser>(`/tenants/${tenantId}/users`, {
      page: params.page,
      size: params.pageSize,
    }),
  tenantJobLabels: (tenantId: string) => apiGet<JobLabel[]>(`/tenants/${tenantId}/job-labels`),
  inviteTenantUser: (tenantId: string, body: InviteUserBody) =>
    apiPost<InviteResult>(`/tenants/${tenantId}/users/invite`, body),
  issueTenantUserTempPassword: (tenantId: string, userId: string) =>
    apiPost<TempPasswordResult>(`/tenants/${tenantId}/users/${userId}/temp-password`, {}),
  setTenantUserStatus: (tenantId: string, userId: string, status: string) =>
    apiPatch<TenantUser>(`/tenants/${tenantId}/users/${userId}/status`, { status }),
  // Adapt backend {status, hasKey,...} → frontend {enabled,...}.
  engines: async (): Promise<AiEngine[]> => {
    const list = await apiGet<BackendEngine[]>('/ai-engines');
    return (list ?? []).map((e) => ({
      id: String(e.id),
      name: e.name,
      provider: e.provider,
      model: e.model,
      enabled: e.status === 'enabled',
      hasKey: e.hasKey,
      isDefault: !!e.isDefault,
      createdAt: e.createdAt,
    }));
  },
  // Backend expects snake_case api_key.
  createEngine: (body: { name: string; provider: string; model: string; apiKey: string }) =>
    apiPost('/ai-engines', {
      provider: body.provider,
      name: body.name,
      model: body.model,
      api_key: body.apiKey,
    }),
  // Backend route is PATCH (not PUT); api_key is snake_case.
  updateEngine: (id: string, body: { name?: string; model?: string; apiKey?: string }) =>
    apiPatch(`/ai-engines/${id}`, { name: body.name, model: body.model, api_key: body.apiKey }),
  // Backend toggles via `status`, not `enabled`.
  setEngineEnabled: (id: string, enabled: boolean) =>
    apiPatch(`/ai-engines/${id}`, { status: enabled ? 'enabled' : 'disabled' }),
  audit: (params: { page: number; pageSize: number }) =>
    apiGetList<AuditEntry>('/audit', { page: params.page, size: params.pageSize }),
};
