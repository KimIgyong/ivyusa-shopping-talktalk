import { Bell, MessageCircle, Package } from 'lucide-react';
import { strings } from '../../i18n/strings';
import { useWidgetStore, type TabKey } from '../../store/widgetStore';
import { useUnreadCount } from '../../hooks/useNotifications';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'notifications', label: strings.tab.notifications, icon: <Bell className="h-5 w-5" /> },
  { key: 'chat', label: strings.tab.chat, icon: <MessageCircle className="h-5 w-5" /> },
  { key: 'orders', label: strings.tab.orders, icon: <Package className="h-5 w-5" /> },
];

export function TabBar() {
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setActiveTab = useWidgetStore((s) => s.setActiveTab);
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const { data } = useUnreadCount(sessionToken);
  const unread = data?.count ?? 0;

  return (
    <nav className="flex border-t border-gray-100 bg-white">
      {TABS.map((t) => {
        const active = activeTab === t.key;
        const showBadge = t.key === 'notifications' && unread > 0;
        return (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              active ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="relative">
              {t.icon}
              {showBadge && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
