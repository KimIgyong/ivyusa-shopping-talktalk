import { useTranslation } from 'react-i18next';
import { useWidgetStore, type TabKey } from '../../store/widgetStore';
import { useUnreadCount } from '../../hooks/useNotifications';
import { useAnalytics } from '../../lib/analytics';

/**
 * The two-tab segmented header (PLN-260817 W-1, frames 34/57).
 *
 * Replaces the icon-and-label bar that sat at the bottom of the panel. Each tab
 * carries its own count badge, which the old bar only ever showed for
 * notifications.
 */
const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'notifications', labelKey: 'tab.notifications' },
  { key: 'chat', labelKey: 'tab.chat' },
];

export function TopTabs({ chatUnread = 0 }: { chatUnread?: number }) {
  const { t } = useTranslation();
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setActiveTab = useWidgetStore((s) => s.setActiveTab);
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const analytics = useAnalytics();
  const { data } = useUnreadCount(sessionToken, authenticated);
  const counts: Record<TabKey, number> = {
    notifications: data?.count ?? 0,
    chat: chatUnread,
  };

  const selectTab = (key: TabKey) => {
    setActiveTab(key);
    analytics.tabView(key);
  };

  return (
    <nav role="tablist" className="flex border-b border-gray-100 bg-white">
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => selectTab(tab.key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 py-3.5 text-sm transition-colors ${
              active ? 'font-bold text-gray-900' : 'font-medium text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(tab.labelKey)}
            {count > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
            {/* The indicator is the active affordance; it sits on the tab rather
                than the nav so it tracks the tab's width, not half the panel. */}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gray-900" />}
          </button>
        );
      })}
    </nav>
  );
}
