import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { statisticsService } from './statistics.service';
import type { CsatListParams, QuestionStatsParams } from './statistics.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useQuestionStats = (params: QuestionStatsParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['question-stats', tenantKey, params],
    queryFn: () => statisticsService.questions(params),
    // Switching tabs should redraw, not blank out — the shape is identical
    // across lenses, only the rows change.
    placeholderData: keepPreviousData,
  });
};

export const useCsatSummary = (from: string, to: string) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['csat', tenantKey, 'summary', from, to],
    queryFn: () => statisticsService.csatSummary(from, to),
    placeholderData: keepPreviousData,
  });
};

export const useCsatAgents = (from: string, to: string) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['csat', tenantKey, 'agents', from, to],
    queryFn: () => statisticsService.csatAgents(from, to),
    placeholderData: keepPreviousData,
  });
};

export const useCsatConversations = (params: CsatListParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['csat', tenantKey, 'conversations', params],
    queryFn: () => statisticsService.csatConversations(params),
    placeholderData: keepPreviousData,
  });
};
