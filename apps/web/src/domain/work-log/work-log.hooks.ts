import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { workLogService } from './work-log.service';
import type { WorkLogParams } from './work-log.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useWorkLog = (params: WorkLogParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['work-log', tenantKey, params],
    queryFn: () => workLogService.list(params),
    placeholderData: keepPreviousData,
  });
};
