import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { coachService } from './coach.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useCoachThreads = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['ai-coach', tenantKey, 'threads'],
    queryFn: coachService.listThreads,
  });
};

export const useCoachThread = (id: number | null) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['ai-coach', tenantKey, 'thread', id],
    queryFn: () => coachService.getThread(id!),
    enabled: id !== null,
  });
};

export function useCreateCoachThread() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('aiSetting');
  return useMutation({
    mutationFn: (args?: { title?: string; aiAgentId?: number | null }) =>
      coachService.createThread(args?.title, args?.aiAgentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-coach', tenantKey, 'threads'] });
      toast.success(t('coach.toastThreadCreated'));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useArchiveCoachThread() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('aiSetting');
  return useMutation({
    mutationFn: (id: number) => coachService.archiveThread(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-coach', tenantKey, 'threads'] });
      toast.success(t('coach.toastThreadArchived'));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Applying a proposal rewrites the tenant AI config, so both the coaching
 * thread (proposal status) and the settings form on the left of the page have
 * to re-read — otherwise the persona textarea keeps showing the old text.
 */
function useProposalMutation(
  fn: (id: number, override?: { persona?: string; rule?: string }) => Promise<unknown>,
  successKey: string,
) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('aiSetting');
  return useMutation({
    mutationFn: (vars: { id: number; override?: { persona?: string; rule?: string } }) =>
      fn(vars.id, vars.override),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-coach', tenantKey] });
      qc.invalidateQueries({ queryKey: ['ai-config', tenantKey] });
      toast.success(t(successKey));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const useApplyProposal = () =>
  useProposalMutation((id, override) => coachService.apply(id, override), 'coach.toastApplied');

export const useRejectProposal = () =>
  useProposalMutation((id) => coachService.reject(id), 'coach.toastRejected');

export const useRevertProposal = () =>
  useProposalMutation((id) => coachService.revert(id), 'coach.toastReverted');
