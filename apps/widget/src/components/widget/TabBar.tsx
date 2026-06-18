import { Bell, MessageCircle, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore, type TabKey } from '../../store/widgetStore';
import { useUnreadCount } from '../../hooks/useNotifications';

const TABS: { key: TabKey; labelKey: string; icon: React.ReactNode }[] = [
  { key: 'notifications', labelKey: 'tab.notifications', icon: <Bell className="h-5 w-5" /> },
  { key: 'chat', labelKey: 'tab.chat', icon: <MessageCircle className="h-5 w-5" /> },
  { key: 'orders', labelKey: 'tab.orders', icon: <Package className="h-5 w-5" /> },
];

export function TabBar() {
  const { t } = useTranslation();
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setActiveTab = useWidgetStore((s) => s.setActiveTab);
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const { data } = useUnreadCount(sessionToken);
  const unread = data?.count ?? 0;

  return (
    <nav className="flex border-t border-gray-100 bg-white">
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        const showBadge = tab.key === 'notifications' && unread > 0;
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              active ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="relative">
              {tab.icon}
              {showBadge && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            {t(tab.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}
