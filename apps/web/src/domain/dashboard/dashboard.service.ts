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

// Mirrors the API's integration_status row — the field is `name`, and reading
// a `provider` that never existed is what left the dashboard labels blank.
export interface IntegrationStatus {
  name: string; // shopify/fulfillment/klaviyo/odoo/google_drive/…
  status: string; // connected / error / disconnected
  lastSyncAt?: string | null;
  detail?: string | null;
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
