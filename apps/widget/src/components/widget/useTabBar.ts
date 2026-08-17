import { useTranslation } from 'react-i18next';
import { useWidgetStore, type TabKey } from '../../store/widgetStore';
import { useUnreadCount, useNotifications } from '../../hooks/useNotifications';
import { useAnalytics } from '../../lib/analytics';
import { tabDefs, type TabDef } from './tabDefs';

/** Notification categories that belong to the orders tab, when there is one. */
const ORDER_CATEGORIES = ['payment', 'shipping', 'review'];

/**
 * Shared state for the top and bottom tab bars (PLN-260817-Widget-Tab-Config).
 *
 * Both bars show the same tabs with the same counts and select them the same
 * way; only the markup differs. Keeping that in a hook means a badge rule fixed
 * for one position is fixed for both.
 */
export function useTabBar(): {
  defs: TabDef[];
  activeTab: TabKey;
  select: (key: TabKey) => void;
  countFor: (key: TabKey) => number;
  label: (def: TabDef) => string;
} {
  const { t } = useTranslation();
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setActiveTab = useWidgetStore((s) => s.setActiveTab);
  const visibleTabs = useWidgetStore((s) => s.visibleTabs);
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const chatUnread = useWidgetStore((s) => s.chatUnread);
  const analytics = useAnalytics();

  const defs = tabDefs(visibleTabs);
  const hasOrdersTab = visibleTabs.includes('orders');

  const { data: unread } = useUnreadCount(sessionToken, authenticated);
  // Only needed to split the unread count between two tabs; skipped entirely
  // when the orders tab is off, which is the default configuration.
  const { data: rows } = useNotifications(
    hasOrdersTab && authenticated ? sessionToken : null,
    'all',
  );

  const orderUnread = (rows ?? []).filter(
    (n) => !n.readAt && ORDER_CATEGORIES.includes(n.category),
  ).length;
  const totalUnread = unread?.count ?? 0;

  function countFor(key: TabKey): number {
    if (key === 'chat') return chatUnread;
    // With both list tabs present the unread count is split by category, so the
    // same notification is never counted twice across two badges.
    if (key === 'orders') return orderUnread;
    return hasOrdersTab ? Math.max(0, totalUnread - orderUnread) : totalUnread;
  }

  return {
    defs,
    activeTab,
    select: (key) => {
      setActiveTab(key);
      analytics.tabView(key);
    },
    countFor,
    label: (def) => t(def.labelKey),
  };
}
