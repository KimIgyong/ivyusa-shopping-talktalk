import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService } from './customers.service';
import type { CustomerListParams } from './customers.service';
import { toast } from '@/store/toast-store';

export const useCustomers = (params: CustomerListParams) =>
  useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersService.list(params),
    placeholderData: keepPreviousData,
  });

export function useUpdateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: string }) =>
      customersService.updateTier(id, tier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer tier updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update tier.');
    },
  });
}
