import { Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { STOREFRONT_URL } from './lib/config';
import { useUnreadBadge } from './hooks/useNotifications';
import { InstallBanner } from './components/InstallBanner';
import ChatPage from './pages/ChatPage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';
import SavesPage from './pages/SavesPage';
import DiaryPage from './pages/DiaryPage';
import NudgePage from './pages/NudgePage';

function Shell() {
  const { t } = useTranslation();
  const unread = useUnreadBadge();

  return (
    <div className="shell">
      <header className="header">
        <h1 className="header-title">{t('app.title')}</h1>
        <div className="header-actions">
          {/* 다이어리 entry lives in the header (F3 — 마이 허브가 없는 PWA에서는 아이콘 진입). */}
          <Link className="header-icon-link" to="/diary" aria-label={t('diary.title')}>
            📖
          </Link>
          {/* 찜/보관함 entry lives in the header (F2 — not a 6th nav tab). */}
          <Link className="header-icon-link" to="/saves" aria-label={t('save.title')}>
            ♡
          </Link>
          {/* Storefront must open top-level in a NEW TAB — Shopify forbids iframing (C1). */}
          <a
            className="btn btn-outline btn-sm header-shop"
            href={STOREFRONT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            🛍 {t('header.shop')} ↗
          </a>
        </div>
      </header>
      <InstallBanner />
      <main className="content">
        <Outlet />
      </main>
      <nav className="bottom-nav">
        <NavItem to="/chat" icon="💬" label={t('tabs.chat')} />
        <NavItem to="/products" icon="🛍" label={t('tabs.products')} />
        <NavItem to="/orders" icon="📦" label={t('tabs.orders')} />
        <NavItem to="/alerts" icon="🔔" label={t('tabs.alerts')} badge={unread} />
        <NavItem to="/settings" icon="⚙️" label={t('tabs.settings')} />
      </nav>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}>
      <span className="nav-icon">
        {icon}
        {badge && badge > 0 ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </span>
      <span className="nav-label">{label}</span>
    </NavLink>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:handle" element={<ProductDetailPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/saves" element={<SavesPage />} />
        <Route path="/diary" element={<DiaryPage />} />
        {/* Public nudge card — must render without a session (recipient has no app). */}
        <Route path="/nudge/:code" element={<NudgePage />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  );
}
