import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { strings } from '../../i18n/strings';
import { useWidgetStore } from '../../store/widgetStore';
import { TabBar } from './TabBar';
import { ChatTab } from '../chat/ChatTab';
import { NotificationsTab } from '../notifications/NotificationsTab';
import { OrdersTab } from '../orders/OrdersTab';
import { PreferencesPanel } from '../settings/PreferencesPanel';

export function WidgetPanel() {
  const activeTab = useWidgetStore((s) => s.activeTab);
  const setPanelOpen = useWidgetStore((s) => s.setPanelOpen);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      className={[
        'flex flex-col overflow-hidden bg-white shadow-lg',
        // mobile: full-width bottom sheet; desktop: floating card
        'fixed inset-x-0 bottom-0 top-0 rounded-none',
        'sm:inset-auto sm:bottom-24 sm:right-5 sm:top-auto sm:h-[600px] sm:w-[380px] sm:rounded-xl',
      ].join(' ')}
      role="dialog"
      aria-label="Support widget"
    >
      {/* Header */}
      <header className="flex items-center justify-between bg-primary-500 px-4 py-3 text-white">
        <span className="text-sm font-semibold">
          {strings.notificationCenter}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings((v) => !v)}
            aria-label={strings.settings}
            className={`rounded-lg p-1.5 hover:bg-white/20 ${
              showSettings ? 'bg-white/20' : ''
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close"
            className="rounded-lg p-1.5 hover:bg-white/20"
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
