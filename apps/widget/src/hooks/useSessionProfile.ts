import { useEffect, useRef } from 'react';
import { useWidgetStore } from '../store/widgetStore';
import { ensureSession } from '../services/sessionService';
import { adoptSessionConsent } from './useSession';

/**
 * Pulls the signed-in shopper's display name once a session becomes
 * authenticated, so the widget can greet them by name.
 *
 * Both ways a session gets bound to a customer land here, without either call
 * site needing to know about profiles: the storefront sign-in path (app-proxy
 * identity → token adopted via postMessage) and the guest order lookup. Neither
 * returns profile fields, so we re-`ensure` with the now-authenticated token —
 * that resumes the *same* session and returns its `customerName`.
 */
export function useSessionProfile() {
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const customerName = useWidgetStore((s) => s.customerName);
  const language = useWidgetStore((s) => s.language);
  const setCustomerName = useWidgetStore((s) => s.setCustomerName);

  // Ask at most once per token — a customer whose name is genuinely unknown
  // (profile backfill still pending) must not trigger a request per render.
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated || !sessionToken || customerName) return;
    if (askedFor.current === sessionToken) return;
    askedFor.current = sessionToken;

    let cancelled = false;
    ensureSession(sessionToken, language)
      .then((res) => {
        if (cancelled) return;
        // Adopt the name; token/auth state stays owned by the paths above.
        if (res.customerName) setCustomerName(res.customerName);
        // Tenant widget copy keys off the shop, not the session — adopt here too
        // (a storefront-signed-in widget makes no other /session/ensure call).
        if (res.widgetCopy) useWidgetStore.getState().setWidgetCopy(res.widgetCopy);
        // This re-ensure is the ONLY /session/ensure a storefront-signed-in
        // widget makes (useEnsureSession bails once authenticated), so the
        // verified session's consent state must be adopted — and a pending one
        // replayed from the local choice — here, or the shopper sees no banner
        // while the server still blocks chat as consent-pending.
        adoptSessionConsent(res);
      })
      .catch(() => {
        /* offline or session gone — greeting simply stays generic */
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, sessionToken, customerName, language, setCustomerName]);
}
