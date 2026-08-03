import { apiGet, apiPost, apiPatch } from '@/lib/api-client';

export interface JobLabel {
  code: string;
  name: string;
}

export interface TenantUser {
  id: string;
  email: string;
  rank: string;
  labelCodes?: string[];
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

export interface InviteResult {
  invitationToken: string;
  tempPassword: string;
  userId: string;
}

export interface TempPasswordResult {
  userId: string;
  email: string;
  tempPassword: string;
}

export const usersService = {
  list: () => apiGet<TenantUser[]>('/users'),
  jobLabels: () => apiGet<JobLabel[]>('/job-labels'),
  invite: (body: InviteUserBody) => apiPost<InviteResult>('/users/invite', body),
  // The API exposes per-field endpoints with distinct RBAC (rank/labels/status),
  // so fan out and only touch the fields that were provided.
  update: async (id: string, body: UpdateUserBody): Promise<void> => {
    if (body.rank !== undefined) {
      await apiPatch<TenantUser>(`/users/${id}/rank`, { rank: body.rank });
    }
    if (body.label_codes !== undefined) {
      await apiPatch<TenantUser>(`/users/${id}/labels`, { label_codes: body.label_codes });
    }
    if (body.status !== undefined) {
      await apiPatch<TenantUser>(`/users/${id}/status`, { status: body.status });
    }
  },
  // Issue a fresh temporary password for an existing user (admin relays it manually).
  issueTempPassword: (id: string) =>
    apiPost<TempPasswordResult>(`/users/${id}/temp-password`, {}),
  // Clear the user's MFA enrollment — they re-enroll at their next login (audited).
  resetMfa: (id: string) => apiPost<{ reset: boolean }>(`/users/${id}/mfa-reset`, {}),
};
