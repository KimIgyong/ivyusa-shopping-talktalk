import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from './admin.service';
import { toast } from '@/store/toast-store';

const TENANTS_KEY = ['admin', 'tenants'];
const ENGINES_KEY = ['admin', 'engines'];
const AUDIT_KEY = ['admin', 'audit'];

export function useTenants(params: { page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...TENANTS_KEY, params],
    queryFn: () => adminService.tenants(params),
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; shopDomain: string; plan: string }) =>
      adminService.createTenant(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
      toast.success('Tenant created');
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
