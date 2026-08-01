import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import i18n, { initialLanguage } from '../i18n/i18n';
import { ensureSession, setConsent, setSessionLanguage } from '../services/sessionService';
import { pushSupported, subscribeAndRegister } from '../lib/push';
import {
  getLangOverride,
  getSessionToken,
  setLangOverride,
  setSessionToken,
} from '../lib/storage';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../lib/config';
import type { SessionResponse } from '../lib/types';

interface SessionContextValue {
  ready: boolean;
  token: string | null;
  session: SessionResponse | null;
  language: AppLanguage;
  /** Re-run /session/ensure with the current token (refreshes consent state). */
  refresh: () => Promise<void>;
  grantConsent: () => Promise<void>;
  changeLanguage: (lang: AppLanguage) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage());
  const bootedRef = useRef(false);

  const bootstrap = useCallback(async () => {
    // SW first: navigator.serviceWorker.ready (used by push subscribe) needs it.
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
      } catch {
        // No SW (e.g. http dev origin): app still works, push stays off.
      }
    }
    const langOverride = getLangOverride();
    const lang = initialLanguage();
    setLanguage(lang);
    await i18n.changeLanguage(lang);
    try {
      const stored = getSessionToken();
      const s = await ensureSession(stored, lang);
      setSessionToken(s.sessionToken);
      setToken(s.sessionToken);
      setSession(s);
      // Server language wins only when the user has not chosen one explicitly
      // (parity with widget/mobile precedence).
      if (!langOverride && s.language) {
        const serverLang = s.language.toLowerCase();
        if (
          serverLang !== lang &&
          (SUPPORTED_LANGUAGES as readonly string[]).includes(serverLang)
        ) {
          setLanguage(serverLang as AppLanguage);
          await i18n.changeLanguage(serverLang);
        }
      }
      // Permission already granted (returning user): silently refresh the
      // subscription registration — server upsert makes this idempotent and
      // covers browser-side subscription rotation.
      if (pushSupported() && Notification.permission === 'granted') {
        void subscribeAndRegister(s.sessionToken, lang);
      }
    } catch {
      // Offline start: keep the shell usable; screens surface their own errors.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (bootedRef.current) return; // StrictMode double-invoke guard
    bootedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const s = await ensureSession(token, language);
    setSessionToken(s.sessionToken);
    setToken(s.sessionToken);
    setSession(s);
  }, [token, language]);

  const grantConsent = useCallback(async () => {
    if (!token) return;
    await setConsent(token, true);
    await refresh();
  }, [token, refresh]);

  const changeLanguage = useCallback(
    async (lang: AppLanguage) => {
      setLanguage(lang);
      setLangOverride(lang);
      await i18n.changeLanguage(lang);
      if (token) {
        try {
          await setSessionLanguage(token, lang.toUpperCase());
        } catch {
          // Server sync is best-effort; local language already switched.
        }
      }
    },
    [token],
  );

  const value = useMemo(
    () => ({ ready, token, session, language, refresh, grantConsent, changeLanguage }),
    [ready, token, session, language, refresh, grantConsent, changeLanguage],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
