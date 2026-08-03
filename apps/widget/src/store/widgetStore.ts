import { create } from 'zustand';
import { setStoredSessionToken } from '../lib/api-client';
import type { ConsentState } from '../lib/types';

export type TabKey = 'notifications' | 'chat' | 'orders';
export type ConsentChoice = 'granted' | 'denied' | null;

/** Persisted privacy/analytics consent choice (shared by chat + analytics). */
const CONSENT_KEY = 'ivy_consent';

function readStoredConsent(): ConsentChoice {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : null;
  } catch {
    return null;
  }
}

/** Server-confirmed consent snapshot (from session/ensure — source of truth). */
export interface ConsentInfo {
  state: ConsentState;
  consentAt: string | null;
  noticeVersion: string | null;
  privacyPolicyUrl: string | null;
  noticeOutdated: boolean;
}

interface WidgetState {
  sessionToken: string | null;
  activeTab: TabKey;
  panelOpen: boolean;
  /** Whether the settings/preferences panel overlays the tabs. */
  settingsOpen: boolean;
  authenticated: boolean;
  /** True while a storefront sign-in popup is in flight (embed brokers it). */
  authPending: boolean;
  /** Signed-in shopper's name, once the backend resolves it; null otherwise. */
  customerName: string | null;
  /**
   * Outcome of the storefront identity handshake (embedded only). 'pending' until
   * the embed loader reports back — the widget must not open a throwaway guest
   * session while a verified one may still be on its way.
   */
  embedIdentity: 'pending' | 'verified' | 'anonymous';
  language: string;
  /** Privacy/analytics consent — gates chat persistence AND GA4 (Consent Mode). */
  consent: ConsentChoice;
  /** A message queued from another tab to be auto-sent when Chat opens. */
  pendingChatMessage: string | null;
  setSessionToken: (t: string | null) => void;
  setActiveTab: (t: TabKey) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  setAuthenticated: (v: boolean) => void;
  setAuthPending: (v: boolean) => void;
  setCustomerName: (n: string | null) => void;
  setEmbedIdentity: (v: 'pending' | 'verified' | 'anonymous') => void;
  setLanguage: (l: string) => void;
  setConsent: (granted: boolean) => void;
  queueChatMessage: (m: string) => void;
  consumeChatMessage: () => string | null;
}

export const useWidgetStore = create<WidgetState>()((set, get) => ({
  // Always null at bootstrap — a persisted token is only used as a resume hint
  // for session/ensure (useEnsureSession) and reaches queries after the backend
  // validates or replaces it. This kills startup 401 noise from stale tokens and,
  // when embedded, keeps a previous customer's persisted session from resuming
  // for a different visitor (privacy) — the app-proxy handshake decides instead.
  sessionToken: null,
  activeTab: 'chat',
  panelOpen: false,
  settingsOpen: false,
  authenticated: false,
  authPending: false,
  customerName: null,
  embedIdentity: 'pending',
  language: 'en',
  consent: readStoredConsent(),
  pendingChatMessage: null,
  setSessionToken: (t) => {
    setStoredSessionToken(t);
    set({ sessionToken: t });
  },
  setActiveTab: (t) => set({ activeTab: t }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setAuthenticated: (v) => set({ authenticated: v }),
  setAuthPending: (v) => set({ authPending: v }),
  setCustomerName: (n) => set({ customerName: n }),
  setEmbedIdentity: (v) => set({ embedIdentity: v }),
  setLanguage: (l) => set({ language: l }),
  setConsent: (granted) => {
    try {
      localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    } catch {
      /* storage unavailable — consent still held in memory for this session */
    }
    set({ consent: granted ? 'granted' : 'denied' });
  },
  queueChatMessage: (m) => set({ pendingChatMessage: m, activeTab: 'chat' }),
  consumeChatMessage: () => {
    const m = get().pendingChatMessage;
    if (m) set({ pendingChatMessage: null });
    return m;
  },
}));
