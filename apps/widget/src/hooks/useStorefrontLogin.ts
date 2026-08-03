import { useCallback } from 'react';
import { useWidgetStore } from '../store/widgetStore';

/**
 * Storefront sign-in trigger for the widget. Sign-in uses the store's own
 * hosted account login (Shopify New/Classic Customer Accounts), which cannot be
 * framed, so the sandboxed widget asks its embed loader to open it — as a
 * whole-tab redirect or a popup, per the tenant's console setting (`loginMode`,
 * delivered via session/ensure). The loader brokers the flow and, on success,
 * hands back a customer-bound session token via the existing `ivy:session`
 * handshake (see useEmbedIdentity); after a redirect the page reload plus the
 * loader's reopen flag get the shopper back to their orders.
 *
 * Only available when embedded in a storefront — in standalone dev there is no
 * store to sign in to, so `canLogin` is false and the guest lookup stands alone.
 */
export function useStorefrontLogin() {
  const pending = useWidgetStore((s) => s.authPending);
  const setAuthPending = useWidgetStore((s) => s.setAuthPending);
  const loginMode = useWidgetStore((s) => s.loginMode);
  const canLogin = typeof window !== 'undefined' && window.parent !== window;

  const login = useCallback(() => {
    if (!canLogin) return;
    setAuthPending(true);
    // The loader (parent) validates this by origin + source before acting.
    window.parent.postMessage({ type: 'ivy:login', mode: loginMode }, '*');
  }, [canLogin, setAuthPending, loginMode]);

  // Stop showing the waiting UI. The popup (if still open) may finish anyway —
  // the loader/useEmbedIdentity still adopt the token — this only frees the UI.
  const cancel = useCallback(() => setAuthPending(false), [setAuthPending]);

  return { canLogin, pending, login, cancel };
}
