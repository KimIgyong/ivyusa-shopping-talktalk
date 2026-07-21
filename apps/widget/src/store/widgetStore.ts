import { create } from 'zustand';
import {
  getStoredSessionToken,
  setStoredSessionToken,
} from '../lib/api-client';

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

interface WidgetState {
  sessionToken: string | null;
  activeTab: TabKey;
  panelOpen: boolean;
  authenticated: boolean;
  language: string;
  /** Privacy/analytics consent — gates chat persistence AND GA4 (Consent Mode). */
  consent: ConsentChoice;
  /** A message queued from another tab to be auto-sent when Chat opens. */
  pendingChatMessage: string | null;
  setSessionToken: (t: string | null) => void;
  setActiveTab: (t: TabKey) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setAuthenticated: (v: boolean) => void;
  setLanguage: (l: string) => void;
  setConsent: (granted: boolean) => void;
  queueChatMessage: (m: string) => void;
  consumeChatMessage: () => string | null;
}

/**
 * Embedded on a storefront? Then ignore any persisted token at bootstrap and let
 * the app-proxy handshake (or an anonymous ensure) decide the session each load.
 * This prevents a previous customer's authenticated session — persisted in this
 * widget origin's localStorage — from resuming for a different/logged-out visitor
 * on a shared browser (privacy). The standalone dev app keeps persistence.
 */
const isEmbedded = typeof window !== 'undefined' && window.parent !== window;

export const useWidgetStore = create<WidgetState>()((set, get) => ({
  sessionToken: isEmbedded ? null : getStoredSessionToken(),
  activeTab: 'chat',
  panelOpen: false,
  authenticated: false,
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
  setAuthenticated: (v) => set({ authenticated: v }),
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
