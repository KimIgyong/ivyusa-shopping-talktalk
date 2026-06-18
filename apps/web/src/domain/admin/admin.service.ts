import { apiGet, apiPost, apiPut, apiPatch } from '@/lib/api-client';
import type { Paginated } from '@/lib/types';

export interface Tenant {
  id: string;
  name: string;
  slug?: string;
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
  functionType?: string;
  enabled: boolean;
  maskedApiKey?: string;
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
    apiGet<Paginated<Tenant>>('/tenants', params),
  createTenant: (body: { name: string; slug: string; plan: string }) =>
    apiPost<Tenant>('/tenants', body),
  setTenantStatus: (id: string, status: string) =>
    apiPatch<Tenant>(`/tenants/${id}/status`, { status }),
  engines: () => apiGet<AiEngine[]>('/ai-engines'),
  createEngine: (body: { name: string; provider: string; model: string; apiKey: string }) =>
    apiPost<AiEngine>('/ai-engines', body),
  updateEngine: (id: string, body: { name?: string; model?: string; apiKey?: string }) =>
    apiPut<AiEngine>(`/ai-engines/${id}`, body),
  setEngineEnabled: (id: string, enabled: boolean) =>
    apiPatch<AiEngine>(`/ai-engines/${id}`, { enabled }),
  audit: (params: { page: number; pageSize: number }) =>
    apiGet<Paginated<AuditEntry>>('/audit', params),
};
