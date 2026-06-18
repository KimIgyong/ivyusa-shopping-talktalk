import { useEffect } from 'react';
import { useWidgetStore } from '../store/widgetStore';
import { ensureSession } from '../services/sessionService';

/**
 * Ensures a session token exists once the widget mounts.
 * Stores token + authenticated flag in the Zustand store.
 */
export function useEnsureSession() {
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const language = useWidgetStore((s) => s.language);
  const setSessionToken = useWidgetStore((s) => s.setSessionToken);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);

  useEffect(() => {
    let cancelled = false;
    ensureSession(sessionToken, language)
      .then((res) => {
        if (cancelled) return;
        if (res.sessionToken && res.sessionToken !== sessionToken) {
          setSessionToken(res.sessionToken);
        }
        setAuthenticated(!!res.authenticated);
      })
      .catch(() => {
        /* offline / backend not running — widget still renders */
      });
    return () => {
      cancelled = true;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
