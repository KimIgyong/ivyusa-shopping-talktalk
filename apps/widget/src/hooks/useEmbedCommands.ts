import { useEffect } from 'react';
import { useWidgetStore, type TabKey } from '../store/widgetStore';
import { ensureSession, identify as identifyRequest } from '../services/sessionService';
import { getParentOrigin, getShopDomain } from './useSession';
import { hostPresent, onHostMessage, postToHost } from '../lib/host-bridge';

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
    if (!hostPresent()) return; // standalone — no host to take commands from

    async function onMessage(raw: Record<string, unknown>) {
      const d = raw as {
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
          postToHost({ type: 'ivy:event', event: 'identified', ok: true });
        } catch {
          // A rejected signature leaves the visitor a guest: they can still ask
          // a question, which is the part that must never depend on identity.
          postToHost({ type: 'ivy:event', event: 'identified', ok: false });
        }
      }
    }

    return onHostMessage((message) => {
      void onMessage(message);
    });
  }, []);
}
