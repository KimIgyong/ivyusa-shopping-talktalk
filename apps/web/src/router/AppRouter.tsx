import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '@/layouts/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LandingPage } from '@/domain/landing/LandingPage';
import { TenantLoginPage } from '@/domain/auth/TenantLoginPage';
import { AdminLoginPage } from '@/domain/auth/AdminLoginPage';

// Route-level code splitting (PERF-13): each page ships as its own chunk so
// the initial bundle is the shell + public pages, not every admin screen at
// once. The landing/login pages stay eager for a fast first paint.
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
const PrivacyNoticePage = lazy(() => import('@/domain/privacy-notice/PrivacyNoticePage').then((m) => ({ default: m.PrivacyNoticePage })));
const MyPage = lazy(() => import('@/domain/my-page/MyPage').then((m) => ({ default: m.MyPage })));
const AdminOverviewPage = lazy(() => import('@/domain/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })));
const TenantsPage = lazy(() => import('@/domain/admin/TenantsPage').then((m) => ({ default: m.TenantsPage })));
const TenantUsersPage = lazy(() => import('@/domain/admin/TenantUsersPage').then((m) => ({ default: m.TenantUsersPage })));
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

// Public: landing at /, system-admin login at /admin/login, per-tenant login
// at /:tenantSlug. Static segments outrank the :tenantSlug param, so every
// console route below stays reachable; slugs matching them are rejected
// server-side (RESERVED_TENANT_SLUGS).
const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    element: (
      <ProtectedRoute actorType="user">
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/live-chat', element: <LiveChatPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/ai-setting', element: <AiSettingsPage /> },
      { path: '/knowledge', element: <KnowledgePage /> },
      { path: '/customers', element: <CustomersPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/campaigns', element: <CampaignsPage /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/privacy-notice', element: <PrivacyNoticePage /> },
      { path: '/my-page', element: <MyPage /> },
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
      { path: 'tenants/:tenantUuid/users', element: <TenantUsersPage /> },
      { path: 'ai-engines', element: <AiEnginesPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'my-page', element: <MyPage /> },
    ],
  },
  { path: '/:tenantSlug', element: <TenantLoginPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
