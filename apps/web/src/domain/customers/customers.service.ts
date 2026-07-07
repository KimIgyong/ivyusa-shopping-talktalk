import { apiGetList, apiPatch } from '@/lib/api-client';
import type { Paginated } from '@/lib/types';

export interface Customer {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  tier?: string;
  orders?: number;
  totalSpent?: number;
  currency?: string | null;
  createdAt?: string;
}

export interface CustomerListParams {
  page: number;
  pageSize: number;
  email?: string;
}

export const customersService = {
  list: (params: CustomerListParams) =>
    apiGetList<Customer>('/customers', {
      page: params.page,
      size: params.pageSize,
      email: params.email || undefined,
    }),
  updateTier: (id: number, tier: string) => apiPatch<Customer>(`/customers/${id}`, { tier }),
};

export type CustomerList = Paginated<Customer>;
