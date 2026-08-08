import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { productsService } from './products.service';
import type { ProductListParams } from './products.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useProducts = (params: ProductListParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['products', tenantKey, params],
    queryFn: () => productsService.list(params),
    placeholderData: keepPreviousData,
  });
};

export const useProductSummary = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['products-summary', tenantKey],
    queryFn: () => productsService.summary(),
  });
};

export const useProductCategories = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['products-categories', tenantKey],
    queryFn: () => productsService.categories(),
  });
};
