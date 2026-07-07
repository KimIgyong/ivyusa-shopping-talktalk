import { apiGet } from '@/lib/api-client';

export interface DashboardData {
  activeChats: number;
  todayNotifications: number;
  aiResolutionRate: number; // 0..1 or 0..100
  unresolvedTopN: number;
  totalConversations: number;
  totalOrders: number;
  // Backend returns a de-duplicated list of recent question strings.
  popularQuestions: string[];
}

export interface IntegrationStatus {
  provider: string;
  status: string; // connected / error / disconnected
  detail?: string;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  statusUi?: string;
  statusInternal?: string;
  total?: number;
  currency?: string;
  itemCount?: number;
  createdAt?: string;
}

export const dashboardService = {
  dashboard: () => apiGet<DashboardData>('/analytics/dashboard'),
  integrations: () => apiGet<IntegrationStatus[]>('/integrations/status'),
  recentOrders: () => apiGet<RecentOrder[]>('/admin/orders', { page: 1, size: 5 }),
};
