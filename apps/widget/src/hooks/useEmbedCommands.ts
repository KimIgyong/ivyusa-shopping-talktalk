import { useEffect } from 'react';
import { useWidgetStore, type TabKey } from '../store/widgetStore';
import { ensureSession, identify as identifyRequest } from '../services/sessionService';
import { getParentOrigin, getShopDomain } from './useSession';

const TABS: TabKey[] = ['chat', 'orders', 'notifications'];

/**
 * Host-application commands (PLN-260819 S3).
 *
 * The public `ShopTalk.open()/identify()/…` methods live in the loader, which
 * cannot reach into the widget's state — it forwards them here as postMessage.
 * This hook is the receiving half.
 *
 * Trust rules are the same as the identity handshake: only our embedder frame,
 * only over a secure origin. `identify` carries a hash the API verifies against
 * the tenant secret, so a hostile page can send one but cannot make it verify.
 */
export function useEmbedCommands(): void {
  useEffect(() => {
    if (window.parent === window) return; // not embedded

    function isTrustedOrigin(origin: string): boolean {
      try {
        const { protocol, hostname } = new URL(origin);
        if (protocol === 'https:') return true;
        return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
      } catch {
        return false;
      }
    }

    async function onMessage(e: MessageEvent) {
      if (e.source !== window.parent) return;
      if (!isTrustedOrigin(e.origin)) return;
      const d = (e.data || {}) as {
        type?: string;
        action?: string;
        tab?: string | null;
        locale?: string;
        user?: { userId: string; hash: string; name?: string; email?: string; phone?: string };
      };
      const store = useWidgetStore.getState();

      if (d.type === 'ivy:command') {
        switch (d.action) {
          case 'open':
            if (d.tab && TABS.includes(d.tab as TabKey)) store.setActiveTab(d.tab as TabKey);
            store.setPanelOpen(true);
            return;
          case 'close':
            store.setPanelOpen(false);
            return;
          case 'toggle':
            store.setPanelOpen(!store.panelOpen);
            return;
          case 'locale':
            if (d.locale) store.setLanguage(d.locale.toUpperCase());
            return;
          case 'logout': {
            // Clearing the token is not enough: useEnsureSession runs once on
            // mount, so nothing would re-open a session and the widget would sit
            // there unable to send anything. Open the guest session here.
            store.setSessionToken(null);
            store.setAuthenticated(false);
            store.setCustomerName(null);
            const fresh = await ensureSession(
              null,
              useWidgetStore.getState().language,
              getShopDomain(),
              getParentOrigin(),
            ).catch(() => null);
            // Tenant config (theme, tabs, copy) does not change on logout, so it
            // is deliberately not re-applied — only the identity is reset.
            if (fresh?.sessionToken) store.setSessionToken(fresh.sessionToken);
            return;
          }
          default:
            return;
        }
      }

      if (d.type === 'ivy:identify' && d.user?.userId && d.user?.hash) {
        const token = useWidgetStore.getState().sessionToken;
        // identify binds an EXISTING session, so it waits for one. A host that
        // calls it during page load would otherwise silently no-op.
        if (!token) return;
        try {
          const res = await identifyRequest(token, d.user);
          store.setAuthenticated(res.authenticated);
          window.parent.postMessage(
            { type: 'ivy:event', event: 'identified', ok: true },
            e.origin,
          );
        } catch {
          // A rejected signature leaves the visitor a guest: they can still ask
          // a question, which is the part that must never depend on identity.
          window.parent.postMessage(
            { type: 'ivy:event', event: 'identified', ok: false },
            e.origin,
          );
        }
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
