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
