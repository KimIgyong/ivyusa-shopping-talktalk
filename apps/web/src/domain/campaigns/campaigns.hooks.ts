import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { campaignsService } from './campaigns.service';
import type { CampaignContent } from './campaigns.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export function useCampaigns() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['campaigns', tenantKey],
    queryFn: () => campaignsService.list(),
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('campaigns');
  return useMutation({
    mutationFn: (body: { name: string; content: CampaignContent }) =>
      campaignsService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns', tenantKey] });
      toast.success(t('toastCreated'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('campaigns');
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; content?: CampaignContent }) =>
      campaignsService.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns', tenantKey] });
      toast.success(t('toastUpdated'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('campaigns');
  return useMutation({
    mutationFn: (id: string) => campaignsService.send(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns', tenantKey] });
      toast.success(t('toastSent'));
    },
    // Send-time link validation failures (unknown handle / non-https URL)
    // surface the API 400 message here as a sticky error toast.
    onError: (err: Error) => toast.error(err.message),
  });
}
