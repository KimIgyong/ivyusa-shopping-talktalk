import { useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { useEnsureSession } from '../../hooks/useSession';
import { useEmbedIdentity } from '../../hooks/useEmbedIdentity';
import { useSessionProfile } from '../../hooks/useSessionProfile';
import { useUnreadCount } from '../../hooks/useNotifications';
import { usePurchaseSignal } from '../../hooks/usePurchaseSignal';
import { useAnalytics } from '../../lib/analytics';
import { WidgetPanel } from './WidgetPanel';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export function Widget() {
  const { t } = useTranslation();
  useEnsureSession();
  useEmbedIdentity();
  useSessionProfile();
  usePurchaseSignal();
  const analytics = useAnalytics();
  const panelOpen = useWidgetStore((s) => s.panelOpen);
  const togglePanel = useWidgetStore((s) => s.togglePanel);
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const { data } = useUnreadCount(sessionToken, authenticated);
  const unread = data?.count ?? 0;
  const prevOpen = useRef(panelOpen);

  // When embedded in a storefront iframe, tell the embed.js loader to grow/shrink
  // the frame as the panel opens/closes. targetOrigin '*' is safe here — the payload
  // is a non-sensitive open flag and the loader validates the message origin.
  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'ivy:resize', open: panelOpen }, '*');
    }
    // Engagement funnel: fire open/close only on an actual transition.
    if (panelOpen !== prevOpen.current) {
      if (panelOpen) analytics.widgetOpen();
      else analytics.widgetClose();
      prevOpen.current = panelOpen;
    }
  }, [panelOpen, analytics]);

  return (
    <>
      {/* The launcher lives OUTSIDE this boundary on purpose: whatever happens to
          the panel, the shopper keeps a way to close and reopen the widget. */}
      {panelOpen && (
        <ErrorBoundary label="panel">
          <WidgetPanel />
        </ErrorBoundary>
      )}

      {/* Floating launcher */}
      <button
        onClick={togglePanel}
        aria-label={panelOpen ? t('a11y.closeSupport') : t('a11y.openSupport')}
        aria-expanded={panelOpen}
        className="fixed bottom-5 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition-transform hover:scale-105 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 active:scale-95"
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
