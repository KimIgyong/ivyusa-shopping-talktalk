import { useQuery } from '@tanstack/react-query';
import { dashboardService } from './dashboard.service';

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: dashboardService.dashboard });

export const useIntegrationStatus = () =>
  useQuery({ queryKey: ['integrations', 'status'], queryFn: dashboardService.integrations });
