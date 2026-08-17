import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore, type TabKey } from '../../store/widgetStore';
import { LanguageSwitcher } from './LanguageSwitcher';
import { TopTabs } from './TopTabs';
import { BottomTabs } from './BottomTabs';
import { ChatTab } from '../chat/ChatTab';
import { NotificationsTab } from '../notifications/NotificationsTab';
import { OrdersTab } from '../orders/OrdersTab';
import { PreferencesPanel } from '../settings/PreferencesPanel';
import { ErrorBoundary } from '../ui/ErrorBoundary';

/**
 * What each tab key renders. `visibleTabs` comes from the server, so a key this
 * build does not know about is reachable — it must draw nothing rather than
 * calling `undefined`.
 */
const PANELS: Partial<Record<TabKey, () => ReactElement>> = {
  notifications: () => <NotificationsTab />,
  orders: () => <OrdersTab />,
  chat: () => <ChatTab />,
};

export function WidgetPanel() {
  const { t } = useTranslation();
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setPanelOpen = useWidgetStore((s) => s.setPanelOpen);
  // Store-held so other surfaces (e.g. the consent banner's "privacy choices"
  // link) can open the settings/preferences area too.
  const showSettings = useWidgetStore((s) => s.settingsOpen);
  const setShowSettings = useWidgetStore((s) => s.setSettingsOpen);
  const displayName = useWidgetStore((s) => s.widgetCopy?.displayName);
  const customerName = useWidgetStore((s) => s.customerName);
  const visibleTabs = useWidgetStore((s) => s.visibleTabs);
  const tabPosition = useWidgetStore((s) => s.tabPosition);
  const panelRef = useRef<HTMLDivElement>(null);

  // Tabs the shopper has opened at least once — mounted from then on.
  const [visited, setVisited] = useState<TabKey[]>([activeTab]);
  useEffect(() => {
    setVisited((v) => (v.includes(activeTab) ? v : [...v, activeTab]));
  }, [activeTab]);

  // Esc closes the panel; focus the panel on open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setPanelOpen]);

  // Mounted = visited AND still configured on. Dropping a tab the tenant
  // switched off matters beyond tidiness: a hidden panel keeps polling.
  const mounted = visibleTabs.filter((key) => visited.includes(key));

  return (
    <div
      ref={panelRef}
      className={[
        'flex flex-col overflow-hidden bg-white shadow-lg focus:outline-none',
        // mobile: full-width bottom sheet; desktop: floating card
        'fixed inset-x-0 bottom-0 top-0 rounded-none',
        'sm:inset-auto sm:bottom-24 sm:right-5 sm:top-auto sm:h-[600px] sm:w-[404px] sm:rounded-xl',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={t('a11y.supportWidget')}
      tabIndex={-1}
    >
      {/* Header — white with a bold title (PLN-260817 W-1), not the coloured bar
          it used to be. The title is still the tenant's display name, never a
          fixed brand string. The language switcher and close button are absent
          from the design but kept deliberately (PLN §7 D-2): without the X, a
          shopper on a touch device has no way to dismiss the panel but Esc. */}
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        {/* Greet the shopper by name once they are known (frame 34, "Hi, Lisa");
            before that the tenant's own name identifies whose widget this is
            (frames 48/49). The two design variants are the two sign-in states,
            not a contradiction. `truncate` keeps a long name from pushing the
            three controls on the right off the header. */}
        <span className="truncate text-xl font-bold text-gray-900">
          {customerName
            ? t('header.greeting', { name: customerName })
            : displayName || t('notificationCenter')}
        </span>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <LanguageSwitcher />
          <button
            onClick={() => setShowSettings(!showSettings)}
            aria-label={t('settings')}
            className={`rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              showSettings ? 'bg-gray-100 text-gray-700' : ''
            }`}
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label={t('a11y.close')}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Tab bar position is a tenant setting (PLN-260817-Widget-Tab-Config). */}
      {!showSettings && tabPosition === 'top' && <TopTabs />}

      {/* Body — visited tabs stay mounted and are hidden, never unmounted.
          ChatTab holds the thread (and its follow-up chips, escalation prompt and
          inline cards) in component state, so swapping tabs used to destroy it:
          coming back showed an empty conversation with nothing to act on.
          Mounting lazily keeps the cost of an unvisited tab at zero. */}
      <div className="min-h-0 flex-1">
        <div className={showSettings ? 'hidden' : 'h-full'}>
          {mounted.map((key) => (
            <div
              key={key}
              role="tabpanel"
              id={`ivy-tabpanel-${key}`}
              aria-labelledby={`ivy-tab-${key}`}
              className={activeTab === key ? 'h-full' : 'hidden'}
            >
              {/* One boundary per tab: a crash here must not cost the shopper
                  the other tabs, and re-entering the tab retries it. */}
              <ErrorBoundary label={key} resetKey={activeTab}>
                {PANELS[key]?.()}
              </ErrorBoundary>
            </div>
          ))}
        </div>
        {showSettings && (
          <ErrorBoundary label="settings">
            <PreferencesPanel onBack={() => setShowSettings(false)} />
          </ErrorBoundary>
        )}
      </div>

      {!showSettings && tabPosition === 'bottom' && <BottomTabs />}
    </div>
  );
}
