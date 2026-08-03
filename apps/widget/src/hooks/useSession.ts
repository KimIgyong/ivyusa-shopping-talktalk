import { useEffect } from 'react';
import { useWidgetStore, type ConsentInfo } from '../store/widgetStore';
import { ensureSession } from '../services/sessionService';
import { getStoredSessionToken } from '../lib/api-client';
import { clearStoredConsent, setStoredConsent } from '../lib/consent';
import type { SessionResponse } from '../lib/types';
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
 * The Shopify shop domain the embed loader passes in the iframe URL (`?shop=`).
 * Binds the session to the right tenant; absent in local/standalone dev.
 */
export function getShopDomain(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get('shop') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize the session/ensure consent fields into the store snapshot and keep
 * the localStorage cache in line with the server (server is source of truth).
 */
export function consentInfoFromSession(res: SessionResponse): ConsentInfo {
  const state =
    res.consentState === 'granted' || res.consentState === 'declined'
      ? res.consentState
      : 'pending';
  return {
    state,
    consentAt: res.consentAt ?? null,
    noticeVersion: res.consentNoticeVersion ?? null,
    privacyPolicyUrl: res.privacyPolicyUrl ?? null,
    noticeOutdated: !!res.noticeOutdated,
  };
}

function syncStoredConsent(info: ConsentInfo): void {
  if (info.state === 'pending' || info.noticeOutdated) clearStoredConsent();
  else setStoredConsent(info.state === 'granted');
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
  const setConsentInfo = useWidgetStore((s) => s.setConsentInfo);

  useEffect(() => {
    let cancelled = false;
    // Resume hint: the store token is always null at bootstrap; a persisted
    // token (standalone only — embedded loads must not resume a previous
    // customer's session) is passed to ensure for validation, and only the
    // token the backend returns reaches the store/queries.
    const resumeToken =
      sessionToken ?? (window.parent === window ? getStoredSessionToken() : null);
    ensureSession(resumeToken, language, getShopDomain())
      .then((res) => {
        if (cancelled) return;
        // The app-proxy handshake (useEmbedIdentity) may have adopted a
        // customer-bound token while this anonymous ensure was in flight. Don't
        // clobber it: re-read the live store and bail if already authenticated.
        if (useWidgetStore.getState().authenticated) return;
        if (res.sessionToken && res.sessionToken !== sessionToken) {
          setSessionToken(res.sessionToken);
        }
        setAuthenticated(!!res.authenticated);

        // Server-side consent is the source of truth for the notice banner
        // (pending / outdated re-prompts regardless of the local cache).
        const consentInfo = consentInfoFromSession(res);
        setConsentInfo(consentInfo);
        syncStoredConsent(consentInfo);

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
