import { MessageCircle, X } from 'lucide-react';
import { useWidgetStore } from '../../store/widgetStore';
import { useEnsureSession } from '../../hooks/useSession';
import { useUnreadCount } from '../../hooks/useNotifications';
import { WidgetPanel } from './WidgetPanel';

export function Widget() {
  useEnsureSession();
  const panelOpen = useWidgetStore((s) => s.panelOpen);
  const togglePanel = useWidgetStore((s) => s.togglePanel);
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const { data } = useUnreadCount(sessionToken);
  const unread = data?.count ?? 0;

  return (
    <>
      {panelOpen && <WidgetPanel />}

      {/* Floating launcher */}
      <button
        onClick={togglePanel}
        aria-label={panelOpen ? 'Close support' : 'Open support'}
        className="fixed bottom-5 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition-transform hover:scale-105 hover:bg-primary-600 active:scale-95"
      >
        {panelOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
        {!panelOpen && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </>
  );
}
