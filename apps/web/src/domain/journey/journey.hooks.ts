import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';
import { journeyService } from './journey.service';

/**
 * A pending report is polled; a finished one is not.
 *
 * Generation runs after the request returns, so without this the operator
 * watches a row that says "pending" until they reload — which reads as broken
 * rather than as working.
 */
export function useJourneyReports(groupId: string | null) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['journey', tenantKey, 'reports', groupId],
    queryFn: () => journeyService.reports(groupId as string),
    enabled: !!groupId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === 'pending') ? 5000 : false,
  });
}

export function useJourneyReport(id: string | null) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['journey', tenantKey, 'report', id],
    queryFn: () => journeyService.report(id as string),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 5000 : false),
  });
}

export function useCreateJourneyReport(groupId: string | null) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('journey');
  return useMutation({
    mutationFn: (v: { period_from?: string; period_to?: string }) =>
      journeyService.create(groupId as string, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey', tenantKey, 'reports', groupId] });
      // Said explicitly because nothing appears yet: the row is queued, not written.
      toast.success(t('queued'));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCompareJourneyReports(groupId: string | null) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('journey');
  return useMutation({
    mutationFn: (reportIds: string[]) => journeyService.compare(reportIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey', tenantKey, 'reports', groupId] });
      toast.success(t('queued'));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useJourneyCriteria() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['journey', tenantKey, 'criteria'],
    queryFn: () => journeyService.criteria(),
  });
}

export function useSaveJourneyCriteria() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('journey');
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => journeyService.saveCriteria(body),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['journey', tenantKey, 'criteria'] });
      // The version number is the point: past reports keep the one they used.
      toast.success(t('criteria.saved', { version: saved.version }));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
