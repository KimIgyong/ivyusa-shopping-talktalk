import { apiGet, apiPatch } from '@/lib/api-client';
import type { Paginated } from '@/lib/types';

export interface Customer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  tier?: string;
  orders?: number;
  totalSpent?: number;
  createdAt?: string;
}

export interface CustomerListParams {
  page: number;
  pageSize: number;
}

export const customersService = {
  list: (params: CustomerListParams) => apiGet<Paginated<Customer>>('/customers', params),
  updateTier: (id: string, tier: string) => apiPatch<Customer>(`/customers/${id}`, { tier }),
};
