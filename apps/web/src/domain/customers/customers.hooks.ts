import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService } from './customers.service';
import type { CustomerListParams } from './customers.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useCustomers = (params: CustomerListParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['customers', tenantKey, params],
    queryFn: () => customersService.list(params),
    placeholderData: keepPreviousData,
  });
};

export function useUpdateTier() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ id, tier }: { id: number; tier: string }) =>
      customersService.updateTier(id, tier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', tenantKey] });
      toast.success('Customer tier updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update tier.');
    },
  });
}
