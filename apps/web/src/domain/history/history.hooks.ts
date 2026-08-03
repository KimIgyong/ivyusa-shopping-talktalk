import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { historyService } from './history.service';
import type { HistoryListParams } from './history.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useConversations = (params: HistoryListParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['conversations', tenantKey, params],
    queryFn: () => historyService.list(params),
    placeholderData: keepPreviousData,
  });
};

/**
 * Transcript for one conversation. Only fetched once a row is opened — the read
 * writes a PII-access audit entry, so it must not fire for rows merely listed.
 */
export const useConversationDetail = (id: string | null) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['conversation', tenantKey, id],
    queryFn: () => historyService.detail(id as string),
    enabled: !!id,
  });
};
