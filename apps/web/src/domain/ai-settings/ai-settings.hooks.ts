import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiSettingsService, type AiFunction } from './ai-settings.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useAiSettings = () => {
  const tenantKey = useTenantKey();
  return useQuery({ queryKey: ['ai-settings', tenantKey], queryFn: aiSettingsService.list });
};

export function useUpdateAiSetting() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ fn, engineId }: { fn: AiFunction; engineId: string }) =>
      aiSettingsService.update(fn, { engine_id: engineId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings', tenantKey] });
      toast.success('AI setting updated.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useModerationRules = () => {
  const tenantKey = useTenantKey();
  return useQuery({ queryKey: ['moderation', tenantKey, 'rules'], queryFn: aiSettingsService.rules });
};

export function useCreateRule() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: aiSettingsService.createRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moderation', tenantKey, 'rules'] });
      toast.success('Rule added.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => aiSettingsService.deleteRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moderation', tenantKey, 'rules'] });
      toast.success('Rule deleted.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
