import { useEffect, useRef, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { LanguageSwitcher } from './LanguageSwitcher';
import { TabBar } from './TabBar';
import { ChatTab } from '../chat/ChatTab';
import { NotificationsTab } from '../notifications/NotificationsTab';
import { OrdersTab } from '../orders/OrdersTab';
import { PreferencesPanel } from '../settings/PreferencesPanel';

export function WidgetPanel() {
  const { t } = useTranslation();
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setPanelOpen = useWidgetStore((s) => s.setPanelOpen);
  const [showSettings, setShowSettings] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes the panel; focus the panel on open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setPanelOpen]);

  return (
    <div
      ref={panelRef}
      className={[
        'flex flex-col overflow-hidden bg-white shadow-lg focus:outline-none',
        // mobile: full-width bottom sheet; desktop: floating card
        'fixed inset-x-0 bottom-0 top-0 rounded-none',
        'sm:inset-auto sm:bottom-24 sm:right-5 sm:top-auto sm:h-[600px] sm:w-[380px] sm:rounded-xl',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={t('a11y.supportWidget')}
      tabIndex={-1}
    >
      {/* Header */}
      <header className="flex items-center justify-between bg-primary-500 px-4 py-3 text-white">
        <span className="text-sm font-semibold">
          {t('notificationCenter')}
        </span>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <button
            onClick={() => setShowSettings((v) => !v)}
            aria-label={t('settings')}
            className={`rounded-lg p-1.5 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70 ${
              showSettings ? 'bg-white/20' : ''
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label={t('a11y.close')}
            className="rounded-lg p-1.5 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {showSettings ? (
          <PreferencesPanel onBack={() => setShowSettings(false)} />
        ) : activeTab === 'notifications' ? (
          <NotificationsTab />
        ) : activeTab === 'chat' ? (
          <ChatTab />
        ) : (
          <OrdersTab />
        )}
      </div>

      {/* Tabs */}
      {!showSettings && <TabBar />}
    </div>
  );
}
