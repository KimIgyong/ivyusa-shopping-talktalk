import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '@/layouts/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/domain/auth/LoginPage';

// Route-level code splitting (PERF-13): each page ships as its own chunk so
// the initial bundle is the shell + login, not every admin screen at once.
// Login and the layout stay eager for a fast first paint.
const DashboardPage = lazy(() => import('@/domain/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LiveChatPage = lazy(() => import('@/domain/live-chat/LiveChatPage').then((m) => ({ default: m.LiveChatPage })));
const HistoryPage = lazy(() => import('@/domain/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const AiSettingsPage = lazy(() => import('@/domain/ai-settings/AiSettingsPage').then((m) => ({ default: m.AiSettingsPage })));
const KnowledgePage = lazy(() => import('@/domain/knowledge/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const CustomersPage = lazy(() => import('@/domain/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const OrdersPage = lazy(() => import('@/domain/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const CampaignsPage = lazy(() => import('@/domain/campaigns/CampaignsPage').then((m) => ({ default: m.CampaignsPage })));
const UsersPage = lazy(() => import('@/domain/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('@/domain/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AdminOverviewPage = lazy(() => import('@/domain/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })));
const TenantsPage = lazy(() => import('@/domain/admin/TenantsPage').then((m) => ({ default: m.TenantsPage })));
const AiEnginesPage = lazy(() => import('@/domain/admin/AiEnginesPage').then((m) => ({ default: m.AiEnginesPage })));
const AuditPage = lazy(() => import('@/domain/admin/AuditPage').then((m) => ({ default: m.AuditPage })));

/** Chunk-load fallback: neutral spinner (no text — nothing to localize). */
function PageFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}

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
  return (
    <Suspense fallback={<PageFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
