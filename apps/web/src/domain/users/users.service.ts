import { apiGet, apiPost, apiPatch } from '@/lib/api-client';

export interface JobLabel {
  code: string;
  name: string;
}

export interface TenantUser {
  id: string;
  email: string;
  rank: string;
  labels?: string[];
  status?: string;
  createdAt?: string;
}

export interface InviteUserBody {
  email: string;
  rank: string;
  label_codes: string[];
}

export interface UpdateUserBody {
  rank?: string;
  label_codes?: string[];
  status?: string;
}

export const usersService = {
  list: () => apiGet<TenantUser[]>('/users'),
  jobLabels: () => apiGet<JobLabel[]>('/job-labels'),
  invite: (body: InviteUserBody) => apiPost<TenantUser>('/users/invite', body),
  update: (id: string, body: UpdateUserBody) => apiPatch<TenantUser>(`/users/${id}`, body),
};
