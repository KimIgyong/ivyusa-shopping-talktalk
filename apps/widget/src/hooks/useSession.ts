import { useEffect } from 'react';
import { useWidgetStore } from '../store/widgetStore';
import { ensureSession } from '../services/sessionService';
import i18n, {
  LANG_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from '../i18n/i18n';

/** True when the user has manually picked a language (persisted to localStorage). */
function hasManualLanguageOverride(): boolean {
  try {
    return !!localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * Ensures a session token exists once the widget mounts.
 * Stores token + authenticated flag in the Zustand store.
 */
export function useEnsureSession() {
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const language = useWidgetStore((s) => s.language);
  const setSessionToken = useWidgetStore((s) => s.setSessionToken);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const setLanguage = useWidgetStore((s) => s.setLanguage);

  useEffect(() => {
    let cancelled = false;
    ensureSession(sessionToken, language)
      .then((res) => {
        if (cancelled) return;
        if (res.sessionToken && res.sessionToken !== sessionToken) {
          setSessionToken(res.sessionToken);
        }
        setAuthenticated(!!res.authenticated);

        // Tie default UI language to the backend session, unless the user
        // has manually overridden it.
        const code = (res.language || '').toLowerCase();
        if (
          (SUPPORTED_LANGUAGES as readonly string[]).includes(code) &&
          !hasManualLanguageOverride()
        ) {
          void i18n.changeLanguage(code);
          setLanguage(code);
        }
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
