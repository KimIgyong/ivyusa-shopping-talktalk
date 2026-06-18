import { apiGet, apiPost } from '@/lib/api-client';

export interface Campaign {
  id: string;
  name: string;
  channel?: string;
  status?: string;
  audienceSize?: number;
  sentCount?: number;
  createdAt?: string;
  message?: string;
}

export const campaignsService = {
  list: () => apiGet<Campaign[]>('/campaigns'),
  create: (body: { name: string; channel: string; message: string }) =>
    apiPost<Campaign>('/campaigns', body),
  send: (id: string) => apiPost<Campaign>(`/campaigns/${id}/send`),
};
