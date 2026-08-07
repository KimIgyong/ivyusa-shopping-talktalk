import { apiGetList, apiPatch } from '@/lib/api-client';

export type ReviewStatus = 'submitted' | 'hidden';

export interface Review {
  id: string;
  customerId?: string | null;
  orderItemId?: string;
  rating: number;
  body?: string | null;
  status: ReviewStatus | string;
  createdAt?: string;
}

export interface ReviewListParams {
  page: number;
  pageSize: number;
}

export const reviewsService = {
  list: (params: ReviewListParams) =>
    apiGetList<Review>('/admin/reviews', { page: params.page, size: params.pageSize }),
  setStatus: (id: string, status: ReviewStatus) =>
    apiPatch<Review>(`/admin/reviews/${id}`, { status }),
};
