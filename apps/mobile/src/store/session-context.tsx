import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import i18n, { deviceLanguage } from '../i18n/i18n';
import { ensureSession, setConsent, setSessionLanguage } from '../services/sessionService';
import { setPref } from '../services/notificationService';
import { registerDeviceForPush } from '../lib/push';
import {
  clearPendingMarketingOptIn,
  getLangOverride,
  getPendingMarketingOptIn,
  getSessionToken,
  setLangOverride,
  setSessionToken,
} from '../lib/storage';
import type { SessionResponse } from '../lib/types';
import { SUPPORTED_LANGUAGES } from '../lib/config';
import type { AppLanguage } from '../lib/config';

interface SessionContextValue {
  ready: boolean;
  token: string | null;
  session: SessionResponse | null;
  language: AppLanguage;
  /** Re-run /session/ensure with the current token (refreshes consent state). */
  refresh: () => Promise<void>;
  /** Adopt the customer-bound token minted by the storefront identity bridge. */
  adoptVerifiedToken: (token: string) => Promise<void>;
  grantConsent: () => Promise<void>;
  changeLanguage: (lang: AppLanguage) => Promise<void>;
  /** Ask permission + register this device's push token (post-onboarding). */
  registerPush: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}

/** Marketing categories toggled by the onboarding opt-in (G5 default-deny fix). */
const MARKETING_CATEGORIES = ['event', 'review'] as const;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [language, setLanguage] = useState<AppLanguage>(deviceLanguage());
  const adoptedRef = useRef<string | null>(null);

  const bootstrap = useCallback(async () => {
    const langOverride = (await getLangOverride()) as AppLanguage | null;
    const lang = langOverride ?? deviceLanguage();
    setLanguage(lang);
    await i18n.changeLanguage(lang);
    try {
      const stored = await getSessionToken();
      const s = await ensureSession(stored, lang);
      await setSessionToken(s.sessionToken);
      setToken(s.sessionToken);
      setSession(s);
      // Server language wins only when the user has not chosen one explicitly
      // (parity with widget useSession precedence).
      if (!langOverride && s.language) {
        const serverLang = s.language.toLowerCase() as AppLanguage;
        if (serverLang !== lang && SUPPORTED_LANGUAGES.includes(serverLang)) {
          setLanguage(serverLang);
          await i18n.changeLanguage(serverLang);
        }
      }
      // Best-effort: permission may not be granted yet (pre-onboarding no-op).
      void registerDeviceForPush(s.sessionToken, lang);
    } catch {
      // Offline start: keep the app usable; screens surface their own errors.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const s = await ensureSession(token, language);
    await setSessionToken(s.sessionToken);
    setToken(s.sessionToken);
    setSession(s);
  }, [token, language]);

  const adoptVerifiedToken = useCallback(
    async (newToken: string) => {
      // Adopt-once per token (parity with widget useEmbedIdentity).
      if (!newToken || newToken === token || adoptedRef.current === newToken) return;
      adoptedRef.current = newToken;
      const s = await ensureSession(newToken, language);
      await setSessionToken(s.sessionToken);
      setToken(s.sessionToken);
      setSession(s);
      // Rebind this device's push token to the now-verified customer.
      await registerDeviceForPush(s.sessionToken, language);
      // Apply the onboarding marketing choice — pref writes need a bound customer.
      const pending = await getPendingMarketingOptIn();
      if (pending != null && s.authenticated) {
        try {
          for (const category of MARKETING_CATEGORIES) {
            await setPref(s.sessionToken, 'push', category, pending);
          }
          await clearPendingMarketingOptIn();
        } catch {
          // Keep the pending flag; retried on the next adoption.
        }
      }
    },
    [token, language],
  );

  const grantConsent = useCallback(async () => {
    if (!token) return;
    await setConsent(token, true);
    await refresh();
  }, [token, refresh]);

  const changeLanguage = useCallback(
    async (lang: AppLanguage) => {
      setLanguage(lang);
      await setLangOverride(lang);
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

  const registerPush = useCallback(async () => {
    if (token) await registerDeviceForPush(token, language);
  }, [token, language]);

  const value = useMemo(
    () => ({
      ready,
      token,
      session,
      language,
      refresh,
      adoptVerifiedToken,
      grantConsent,
      changeLanguage,
      registerPush,
    }),
    [ready, token, session, language, refresh, adoptVerifiedToken, grantConsent, changeLanguage, registerPush],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
