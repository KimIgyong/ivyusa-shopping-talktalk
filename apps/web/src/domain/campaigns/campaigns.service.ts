import { apiGet, apiPatch, apiPost } from '@/lib/api-client';

/**
 * Deep-link carried in campaign content (PLN-260807 F4, A-9).
 * product: `handle` is validated against the tenant catalog at send time.
 * url: must be https:// (validated at send time).
 */
export interface CampaignLink {
  type: 'product' | 'url';
  handle?: string;
  url?: string;
}

/** Campaign content JSON — message/channel plus the optional deep-link. */
export interface CampaignContent {
  message?: string;
  channel?: string;
  link?: CampaignLink;
  [key: string]: unknown;
}

export interface Campaign {
  id: string;
  name: string;
  channel?: string;
  status?: string;
  audienceSize?: number;
  sentCount?: number;
  createdAt?: string;
  content?: CampaignContent | null;
}

export const campaignsService = {
  list: () => apiGet<Campaign[]>('/campaigns'),
  create: (body: { name: string; content: CampaignContent }) =>
    apiPost<Campaign>('/campaigns', body),
  update: (id: string, body: { name?: string; content?: CampaignContent }) =>
    apiPatch<Campaign>(`/campaigns/${id}`, body),
  send: (id: string) => apiPost<Campaign>(`/campaigns/${id}/send`),
};
