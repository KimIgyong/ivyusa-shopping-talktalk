import { apiGet } from '@/lib/api-client';
import type { Paginated } from '@/lib/types';

export interface ConversationRow {
  id: string;
  customerName?: string;
  status?: string;
  escalated?: boolean;
  channel?: string;
  messageCount?: number;
  startedAt?: string;
  endedAt?: string;
  summary?: string;
}

export interface HistoryListParams {
  page: number;
  pageSize: number;
  status?: string;
  escalated?: boolean;
}

export const historyService = {
  list: (params: HistoryListParams) =>
    apiGet<Paginated<ConversationRow>>('/analytics/conversations', params),
  detail: (id: string) => apiGet<ConversationRow>(`/analytics/conversations/${id}`),
};
