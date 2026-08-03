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

/**
 * How long the embedded widget waits for the storefront identity handshake before
 * falling back to a guest session. Covers the storefront → Shopify → app proxy
 * round trip (~2s observed) without leaving chat unusable if the proxy is absent.
 */
const IDENTITY_WAIT_MS = 5000;

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
  // Token/auth state is read via getState() inside the effect: this runs once on
  // mount and must see the live value after the async identity wait, not the
  // value captured at render time.
  const language = useWidgetStore((s) => s.language);
  const setSessionToken = useWidgetStore((s) => s.setSessionToken);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const setCustomerName = useWidgetStore((s) => s.setCustomerName);
  const setLanguage = useWidgetStore((s) => s.setLanguage);
  const setConsentInfo = useWidgetStore((s) => s.setConsentInfo);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const embedded = window.parent !== window;

    function start() {
      if (cancelled) return;
      // A verified session already arrived from the storefront handshake — it is
      // customer-bound and carries the shopper's history, so don't open another.
      if (useWidgetStore.getState().authenticated) return;
      run();
    }

    // When embedded, the identity round trip (storefront → Shopify → app) finishes
    // well after the widget mounts. Opening a guest session immediately meant a
    // signed-in shopper started on a throwaway session on every page load — which
    // is where their chat thread went. Wait for the loader's verdict, with a
    // timeout so a store without the app proxy (or an older embed.js that never
    // reports) still gets a working guest session.
    if (embedded && useWidgetStore.getState().embedIdentity === 'pending') {
      unsubscribe = useWidgetStore.subscribe((s) => {
        if (s.embedIdentity !== 'pending') {
          unsubscribe?.();
          unsubscribe = undefined;
          start();
        }
      });
      timer = setTimeout(() => {
        unsubscribe?.();
        unsubscribe = undefined;
        start();
      }, IDENTITY_WAIT_MS);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        unsubscribe?.();
      };
    }

    run();

    function run() {
    // Resume hint: the store token is always null at bootstrap; a persisted
    // token (standalone only — embedded loads must not resume a previous
    // customer's session) is passed to ensure for validation, and only the
    // token the backend returns reaches the store/queries.
    const resumeToken =
      useWidgetStore.getState().sessionToken ?? (embedded ? null : getStoredSessionToken());
    ensureSession(resumeToken, language, getShopDomain())
      .then((res) => {
        if (cancelled) return;
        // The app-proxy handshake (useEmbedIdentity) may have adopted a
        // customer-bound token while this anonymous ensure was in flight. Don't
        // clobber it: re-read the live store and bail if already authenticated.
        if (useWidgetStore.getState().authenticated) return;
        if (res.sessionToken && res.sessionToken !== useWidgetStore.getState().sessionToken) {
          setSessionToken(res.sessionToken);
        }
        setAuthenticated(!!res.authenticated);
        if (res.customerName) setCustomerName(res.customerName);

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
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
