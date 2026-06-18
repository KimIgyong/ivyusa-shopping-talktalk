import { apiGet } from '@/lib/api-client';

export interface DashboardData {
  activeChats: number;
  todayNotifications: number;
  aiResolutionRate: number; // 0..1 or 0..100
  unresolvedTopN: number;
  totalConversations: number;
  totalOrders: number;
  popularQuestions: { question: string; count: number }[];
}

export interface IntegrationStatus {
  provider: string;
  status: string; // connected / error / disconnected
  detail?: string;
}

export const dashboardService = {
  dashboard: () => apiGet<DashboardData>('/analytics/dashboard'),
  integrations: () => apiGet<IntegrationStatus[]>('/integrations/status'),
};
