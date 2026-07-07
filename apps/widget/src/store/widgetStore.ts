import { create } from 'zustand';
import {
  getStoredSessionToken,
  setStoredSessionToken,
} from '../lib/api-client';

export type TabKey = 'notifications' | 'chat' | 'orders';

interface WidgetState {
  sessionToken: string | null;
  activeTab: TabKey;
  panelOpen: boolean;
  authenticated: boolean;
  language: string;
  /** A message queued from another tab to be auto-sent when Chat opens. */
  pendingChatMessage: string | null;
  setSessionToken: (t: string | null) => void;
  setActiveTab: (t: TabKey) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setAuthenticated: (v: boolean) => void;
  setLanguage: (l: string) => void;
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
  queueChatMessage: (m) => set({ pendingChatMessage: m, activeTab: 'chat' }),
  consumeChatMessage: () => {
    const m = get().pendingChatMessage;
    if (m) set({ pendingChatMessage: null });
    return m;
  },
}));
