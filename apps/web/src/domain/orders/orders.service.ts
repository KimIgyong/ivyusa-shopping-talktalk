import { apiGetList } from '@/lib/api-client';

export interface OrderRow {
  id: number;
  orderNumber: string;
  statusInternal?: string | null;
  statusUi?: string | null;
  total?: number | null;
  currency?: string | null;
  itemCount?: number;
  createdAt?: string;
}

export interface OrderListParams {
  page: number;
  pageSize: number;
}

export const ordersService = {
  list: (params: OrderListParams) =>
    apiGetList<OrderRow>('/admin/orders', { page: params.page, size: params.pageSize }),
};
