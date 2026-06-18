import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService } from './settings.service';
import type { UpdateCredentialBody } from './settings.service';
import { toast } from '@/store/toast-store';

export const useCredentials = () =>
  useQuery({
    queryKey: ['credentials'],
    queryFn: () => settingsService.credentials(),
  });

export function useUpdateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, body }: { provider: string; body: UpdateCredentialBody }) =>
      settingsService.updateCredential(provider, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] });
      toast.success('Credential updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update credential.');
    },
  });
}
