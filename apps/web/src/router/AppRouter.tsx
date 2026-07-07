import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/domain/auth/LoginPage';
import { DashboardPage } from '@/domain/dashboard/DashboardPage';
import { LiveChatPage } from '@/domain/live-chat/LiveChatPage';
import { HistoryPage } from '@/domain/history/HistoryPage';
import { AiSettingsPage } from '@/domain/ai-settings/AiSettingsPage';
import { KnowledgePage } from '@/domain/knowledge/KnowledgePage';
import { CustomersPage } from '@/domain/customers/CustomersPage';
import { OrdersPage } from '@/domain/orders/OrdersPage';
import { CampaignsPage } from '@/domain/campaigns/CampaignsPage';
import { UsersPage } from '@/domain/users/UsersPage';
import { SettingsPage } from '@/domain/settings/SettingsPage';
import { AdminOverviewPage } from '@/domain/admin/AdminOverviewPage';
import { TenantsPage } from '@/domain/admin/TenantsPage';
import { AiEnginesPage } from '@/domain/admin/AiEnginesPage';
import { AuditPage } from '@/domain/admin/AuditPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute actorType="user">
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'live-chat', element: <LiveChatPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'ai-setting', element: <AiSettingsPage /> },
      { path: 'knowledge', element: <KnowledgePage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute actorType="admin">
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'tenants', element: <TenantsPage /> },
      { path: 'ai-engines', element: <AiEnginesPage /> },
      { path: 'audit', element: <AuditPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
