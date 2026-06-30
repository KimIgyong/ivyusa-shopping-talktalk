import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService } from './settings.service';
import type { UpdateCredentialBody } from './settings.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useCredentials = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['credentials', tenantKey],
    queryFn: () => settingsService.credentials(),
  });
};

export function useUpdateCredential() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ provider, body }: { provider: string; body: UpdateCredentialBody }) =>
      settingsService.updateCredential(provider, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials', tenantKey] });
      toast.success('Credential updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update credential.');
    },
  });
}
