import { useQuery } from '@tanstack/react-query';
import { dashboardService } from './dashboard.service';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useDashboard = () => {
  const tenantKey = useTenantKey();
  return useQuery({ queryKey: ['dashboard', tenantKey], queryFn: dashboardService.dashboard });
};

export const useIntegrationStatus = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['integrations', tenantKey, 'status'],
    queryFn: dashboardService.integrations,
  });
};
