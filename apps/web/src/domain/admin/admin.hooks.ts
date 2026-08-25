import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminService } from './admin.service';
import type { MenuProvisionMode } from './admin.service';
import type { InviteUserBody } from '@/domain/users/users.service';
import { toast } from '@/store/toast-store';

const TENANTS_KEY = ['admin', 'tenants'];
const ENGINES_KEY = ['admin', 'engines'];
const AUDIT_KEY = ['admin', 'audit'];
const ADMINS_KEY = ['admin', 'admins'];

// ---- Platform-admin accounts (REQ-260824) ----

export function useAdminAccounts() {
  return useQuery({ queryKey: ADMINS_KEY, queryFn: () => adminService.admins() });
}

export function useInviteAdmin() {
  const { t } = useTranslation('adminUsers');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; level: 'super_admin' | 'admin'; sendEmail: boolean }) =>
      adminService.inviteAdmin(v.email, v.level, v.sendEmail),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMINS_KEY });
      toast.success(t('invited'));
    },
    onError: (err: Error) => toast.error(err.message || t('inviteError'), { sticky: true }),
  });
}

export function useIssueAdminTempPassword() {
  const { t } = useTranslation('adminUsers');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { adminId: string; sendEmail: boolean }) =>
      adminService.issueAdminTempPassword(v.adminId, v.sendEmail),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMINS_KEY }),
    onError: (err: Error) => toast.error(err.message || t('tempPwError'), { sticky: true }),
  });
}

export function useSetAdminStatus() {
  const { t } = useTranslation('adminUsers');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { adminId: string; status: 'active' | 'suspended' }) =>
      adminService.setAdminStatus(v.adminId, v.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMINS_KEY });
      toast.success(t('statusChanged'));
    },
    onError: (err: Error) => toast.error(err.message || t('statusError'), { sticky: true }),
  });
}

export function useTenants(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...TENANTS_KEY, params],
    queryFn: () => adminService.tenants(params),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; shopDomain: string; plan: string; slug?: string }) =>
      adminService.createTenant(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
      toast.success('Tenant created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetTenantPlan() {
  const qc = useQueryClient();
  const { t } = useTranslation('tenants');
  return useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => adminService.setTenantPlan(id, plan),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
      toast.success(t('planSaved'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetTenantWorkflowMode() {
  const qc = useQueryClient();
  const { t } = useTranslation('tenants');
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: string }) =>
      adminService.setTenantWorkflowMode(id, mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
      toast.success(t('workflowSaved'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetTenantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminService.setTenantStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
      toast.success('Tenant status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ---- Admin-scoped per-tenant user management ----

export function useAdminTenant(tenantId: string) {
  return useQuery({
    queryKey: [...TENANTS_KEY, 'detail', tenantId],
    queryFn: () => adminService.tenant(tenantId),
    enabled: !!tenantId,
  });
}

export function useTenantUsers(tenantId: string, params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...TENANTS_KEY, tenantId, 'users', params],
    queryFn: () => adminService.tenantUsers(tenantId, params),
    enabled: !!tenantId,
  });
}

export function useTenantJobLabels(tenantId: string) {
  return useQuery({
    queryKey: [...TENANTS_KEY, tenantId, 'job-labels'],
    queryFn: () => adminService.tenantJobLabels(tenantId),
    enabled: !!tenantId,
  });
}

export function useInviteTenantUser(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteUserBody) => adminService.inviteTenantUser(tenantId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TENANTS_KEY, tenantId, 'users'] });
      qc.invalidateQueries({ queryKey: TENANTS_KEY }); // userCount on the list
      toast.success('User invited');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useIssueTenantUserTempPassword(tenantId: string) {
  return useMutation({
    mutationFn: ({ userId, sendEmail }: { userId: string; sendEmail: boolean }) =>
      adminService.issueTenantUserTempPassword(tenantId, userId, sendEmail),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useResetTenantUserMfa(tenantId: string) {
  return useMutation({
    mutationFn: (userId: string) => adminService.resetTenantUserMfa(tenantId, userId),
    onError: (err: Error) => toast.error(err.message, { sticky: true }),
  });
}

export function useSetTenantUserStatus(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      adminService.setTenantUserStatus(tenantId, userId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TENANTS_KEY, tenantId, 'users'] });
      toast.success('User status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useEngines() {
  return useQuery({
    queryKey: ENGINES_KEY,
    queryFn: () => adminService.engines(),
  });
}

export function useCreateEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; provider: string; model: string; apiKey: string }) =>
      adminService.createEngine(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENGINES_KEY });
      toast.success('Engine added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; model?: string; apiKey?: string };
    }) => adminService.updateEngine(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENGINES_KEY });
      toast.success('Engine updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetEngineEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminService.setEngineEnabled(id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENGINES_KEY });
      toast.success('Engine status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAudit(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...AUDIT_KEY, params],
    queryFn: () => adminService.audit(params),
  });
}

// ---- Menu provisioning (PLN-260812 S2) ----

export function useTenantMenus(tenantUuid: string, enabled = true) {
  return useQuery({
    queryKey: [...TENANTS_KEY, tenantUuid, 'menus'],
    queryFn: () => adminService.tenantMenus(tenantUuid),
    enabled: enabled && !!tenantUuid,
  });
}

export function useSaveTenantMenus(tenantUuid: string) {
  const { t } = useTranslation('tenants');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (menus: { code: string; mode: MenuProvisionMode }[]) =>
      adminService.saveTenantMenus(tenantUuid, menus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TENANTS_KEY, tenantUuid, 'menus'] });
      // Success auto-closes; errors stay until dismissed (dev-kit §4.3).
      toast.success(t('menus.saved'));
    },
    onError: (err: Error) => toast.error(err.message || t('menus.saveError'), { sticky: true }),
  });
}
