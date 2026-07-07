import { apiGet, apiGetList } from '@/lib/api-client';

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
    apiGetList<ConversationRow>('/analytics/conversations', {
      page: params.page,
      size: params.pageSize,
      status: params.status,
      escalated: params.escalated,
    }),
  detail: (id: string) => apiGet<ConversationRow>(`/analytics/conversations/${id}`),
};
