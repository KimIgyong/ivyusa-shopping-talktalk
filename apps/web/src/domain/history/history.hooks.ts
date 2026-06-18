import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { historyService } from './history.service';
import type { HistoryListParams } from './history.service';

export const useConversations = (params: HistoryListParams) =>
  useQuery({
    queryKey: ['conversations', params],
    queryFn: () => historyService.list(params),
    placeholderData: keepPreviousData,
  });
