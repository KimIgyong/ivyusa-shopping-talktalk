import { create } from 'zustand';
import { setStoredSessionToken } from '../lib/api-client';

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

export const useWidgetStore = create<WidgetState>()((set, get) => ({
  // Always null at bootstrap — a persisted token is only used as a resume hint
  // for session/ensure (useEnsureSession) and reaches queries after the backend
  // validates or replaces it. This kills startup 401 noise from stale tokens and,
  // when embedded, keeps a previous customer's persisted session from resuming
  // for a different visitor (privacy) — the app-proxy handshake decides instead.
  sessionToken: null,
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
