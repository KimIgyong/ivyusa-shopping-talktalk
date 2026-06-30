import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignsService } from './campaigns.service';
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
  return useMutation({
    mutationFn: (body: { name: string; channel: string; message: string }) =>
      campaignsService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns', tenantKey] });
      toast.success('Campaign created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => campaignsService.send(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns', tenantKey] });
      toast.success('Campaign sent');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
