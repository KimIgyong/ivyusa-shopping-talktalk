import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { statisticsService } from './statistics.service';
import type { QuestionStatsParams } from './statistics.service';
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
