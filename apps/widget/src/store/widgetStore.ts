import { create } from 'zustand';
import { setStoredSessionToken } from '../lib/api-client';
import type { ConsentState } from '../lib/types';

export type TabKey = 'notifications' | 'chat' | 'orders';

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
  language: string;
  /** Null until session/ensure has reported the server-side consent state. */
  consent: ConsentInfo | null;
  /** A message queued from another tab to be auto-sent when Chat opens. */
  pendingChatMessage: string | null;
  setSessionToken: (t: string | null) => void;
  setActiveTab: (t: TabKey) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  setAuthenticated: (v: boolean) => void;
  setLanguage: (l: string) => void;
  setConsentInfo: (c: ConsentInfo | null) => void;
  /** Record a fresh, server-acknowledged consent choice (clears outdated flag). */
  updateConsentState: (
    state: ConsentState,
    consentAt: string | null,
    noticeVersion?: string,
  ) => void;
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
  language: 'en',
  consent: null,
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
  setLanguage: (l) => set({ language: l }),
  setConsentInfo: (c) => set({ consent: c }),
  updateConsentState: (state, consentAt, noticeVersion) =>
    set((s) => ({
      consent: {
        state,
        consentAt,
        noticeVersion: noticeVersion ?? s.consent?.noticeVersion ?? null,
        privacyPolicyUrl: s.consent?.privacyPolicyUrl ?? null,
        // A just-recorded choice is always against the current notice version.
        noticeOutdated: false,
      },
    })),
  queueChatMessage: (m) => set({ pendingChatMessage: m, activeTab: 'chat' }),
  consumeChatMessage: () => {
    const m = get().pendingChatMessage;
    if (m) set({ pendingChatMessage: null });
    return m;
  },
}));
