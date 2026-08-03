/**
 * GA4 core — a thin, consent-aware wrapper around gtag.js.
 *
 * - No-ops entirely when no measurement ID is configured (dev / tests / stores
 *   that don't opt in), so importing analytics never breaks the widget.
 * - Consent Mode v2: analytics_storage defaults to DENIED and only flips to
 *   GRANTED once the visitor accepts the widget's privacy notice — consistent
 *   with the CCPA/GDPR posture of the rest of the app. Until then gtag runs in
 *   cookieless "consent denied" mode (pings without identifiers) and we hold
 *   back custom events.
 * - Events raised before init/consent are queued and flushed on grant.
 */

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

interface Ga4State {
  measurementId: string | null;
  loaded: boolean;
  consentGranted: boolean;
  /** Params merged into every event (UTM/attribution + session/tenant context). */
  commonParams: Record<string, unknown>;
  /** Events raised before load/consent; flushed once both are satisfied. */
  queue: Array<{ name: string; params: Record<string, unknown> }>;
}

const state: Ga4State = {
  measurementId: null,
  loaded: false,
  consentGranted: false,
  commonParams: {},
  queue: [],
};

function gtag(...args: GtagArgs): void {
  window.dataLayer = window.dataLayer || [];
  // gtag must push `arguments` verbatim (not an array) for GA to parse it.
  window.dataLayer.push(args);
}

/** Resolve the measurement ID: explicit arg → iframe `?ga4=` → build-time env. */
export function resolveMeasurementId(explicit?: string | null): string | null {
  if (explicit && explicit.trim()) return explicit.trim();
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ga4');
    if (fromUrl && /^G-[A-Z0-9]+$/i.test(fromUrl)) return fromUrl;
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

export function isEnabled(): boolean {
  return !!state.measurementId;
}

/**
 * Initialize GA4 once. Injects gtag.js, sets Consent Mode v2 defaults (denied),
 * and configures the property with `send_page_view: false` (this is an app, not
 * a set of pages — we emit our own funnel events). Safe to call repeatedly.
 */
export function initGa4(measurementId: string | null, initialConsent = false): void {
  if (state.loaded || !measurementId) return;
  state.measurementId = measurementId;
  state.consentGranted = initialConsent;

  window.dataLayer = window.dataLayer || [];

  // Consent Mode v2 defaults BEFORE config — start denied, cookieless.
  gtag('consent', 'default', {
    analytics_storage: initialConsent ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date().toISOString() as unknown as string);
  gtag('config', measurementId, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  state.loaded = true;
  if (initialConsent) flush();
}

/** Merge params applied to every subsequent event (UTM/attribution, tenant, lang). */
export function setCommonParams(params: Record<string, unknown>): void {
  state.commonParams = { ...state.commonParams, ...params };
}

/** Update consent (from the widget's CCPA choice). Granting flushes the queue. */
export function setConsent(granted: boolean): void {
  state.consentGranted = granted;
  if (!state.loaded) return;
  gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
  if (granted) flush();
}

function emit(name: string, params: Record<string, unknown>): void {
  gtag('event', name, { ...state.commonParams, ...params });
}

/**
 * Track an event. Held in the queue until GA4 is loaded AND consent is granted,
 * then flushed in order. Without consent, nothing identifiable is sent.
 */
export function track(name: string, params: Record<string, unknown> = {}): void {
  if (!state.measurementId) return; // analytics disabled — no-op
  if (!state.loaded || !state.consentGranted) {
    state.queue.push({ name, params });
    // Bound the pre-consent queue so a long anonymous session can't grow it forever.
    if (state.queue.length > 100) state.queue.shift();
    return;
  }
  emit(name, params);
}

function flush(): void {
  const pending = state.queue.splice(0, state.queue.length);
  for (const e of pending) emit(e.name, e.params);
}

/** Test-only reset. */
export function __resetGa4ForTest(): void {
  state.measurementId = null;
  state.loaded = false;
  state.consentGranted = false;
  state.commonParams = {};
  state.queue = [];
}
