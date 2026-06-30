import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService } from './users.service';
import type { InviteUserBody, UpdateUserBody } from './users.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useUsers = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['users', tenantKey],
    queryFn: () => usersService.list(),
  });
};

export const useJobLabels = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['job-labels', tenantKey],
    queryFn: () => usersService.jobLabels(),
  });
};

export function useInviteUser() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: InviteUserBody) => usersService.invite(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', tenantKey] });
      toast.success('User invited.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to invite user.');
    },
  });
}

export function useIssueTempPassword() {
  return useMutation({
    mutationFn: (id: string) => usersService.issueTempPassword(id),
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to issue temporary password.');
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserBody }) =>
      usersService.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', tenantKey] });
      toast.success('User updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update user.');
    },
  });
}
