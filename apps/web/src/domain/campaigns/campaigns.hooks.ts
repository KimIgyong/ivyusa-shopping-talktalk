import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignsService } from './campaigns.service';
import { toast } from '@/store/toast-store';

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsService.list(),
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; channel: string; message: string }) =>
      campaignsService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => campaignsService.send(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign sent');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
