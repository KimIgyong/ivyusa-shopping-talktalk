import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ordersService } from './orders.service';
import type { OrderListParams } from './orders.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useOrders = (params: OrderListParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['orders', tenantKey, params],
    queryFn: () => ordersService.list(params),
    placeholderData: keepPreviousData,
  });
};
