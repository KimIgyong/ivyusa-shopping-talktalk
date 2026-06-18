import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiSettingsService, type AiFunction } from './ai-settings.service';
import { toast } from '@/store/toast-store';

export const useAiSettings = () =>
  useQuery({ queryKey: ['ai-settings'], queryFn: aiSettingsService.list });

export function useUpdateAiSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fn, engineId }: { fn: AiFunction; engineId: string }) =>
      aiSettingsService.update(fn, { engine_id: engineId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('AI setting updated.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useModerationRules = () =>
  useQuery({ queryKey: ['moderation', 'rules'], queryFn: aiSettingsService.rules });

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: aiSettingsService.createRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moderation', 'rules'] });
      toast.success('Rule added.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiSettingsService.deleteRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moderation', 'rules'] });
      toast.success('Rule deleted.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
