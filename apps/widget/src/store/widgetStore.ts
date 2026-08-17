import { create } from 'zustand';
import { setStoredSessionToken } from '../lib/api-client';
import { initialLanguage } from '../i18n/i18n';
import type { ConsentState, WidgetCopy, WidgetLoginMode } from '../lib/types';

/**
 * The widget has two tabs (PLN-260817 S3). 'orders' was a third until the Master
 * Shots moved to a two-tab segmented header; its content now lives under the
 * notification tab's Shipping/Payment filters and as inline cards in chat.
 */
export type TabKey = 'notifications' | 'chat';

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
  /** Tenant setting: how "Sign in" opens the storefront login (session/ensure). */
  loginMode: WidgetLoginMode;
  /** Tenant widget copy (display name + greetings) from session/ensure. */
  widgetCopy: WidgetCopy | null;
  /** Signed-in shopper's name, once the backend resolves it; null otherwise. */
  customerName: string | null;
  /**
   * Outcome of the storefront identity handshake (embedded only). 'pending' until
   * the embed loader reports back — the widget must not open a throwaway guest
   * session while a verified one may still be on its way.
   */
  embedIdentity: 'pending' | 'verified' | 'anonymous';
  language: string;
  /**
   * Privacy consent — gates chat persistence AND GA4 (Consent Mode).
   * Null until session/ensure has reported the server-side state (server is
   * the source of truth; lib/consent.ts holds the local bootstrap cache).
   */
  consent: ConsentInfo | null;
  /** A message queued from another tab to be auto-sent when Chat opens. */
  pendingChatMessage: string | null;
  /**
   * Selected notification filter chip. Store-held rather than tab-local so other
   * surfaces can deep-link into one — a redirect sign-in returning with
   * `?reopen=orders` lands on Shipping, which is where orders now live.
   */
  notificationFilter: string;
  /**
   * Inbound chat messages that arrived while the Chat tab was not the active one
   * — the count on the Chat tab's badge (PLN-260817 W-1). Cleared the moment the
   * shopper opens the tab, since the messages are then on screen.
   */
  chatUnread: number;
  setSessionToken: (t: string | null) => void;
  setActiveTab: (t: TabKey) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  setAuthenticated: (v: boolean) => void;
  setAuthPending: (v: boolean) => void;
  setLoginMode: (m: WidgetLoginMode) => void;
  setWidgetCopy: (c: WidgetCopy | null) => void;
  setCustomerName: (n: string | null) => void;
  setEmbedIdentity: (v: 'pending' | 'verified' | 'anonymous') => void;
  setLanguage: (l: string) => void;
  setConsentInfo: (c: ConsentInfo | null) => void;
  /** Record a fresh, server-acknowledged consent choice (clears outdated flag). */
  updateConsentState: (
    state: ConsentState,
    consentAt: string | null,
    noticeVersion?: string,
  ) => void;
  setNotificationFilter: (f: string) => void;
  bumpChatUnread: (n: number) => void;
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
  loginMode: 'redirect',
  widgetCopy: null,
  customerName: null,
  embedIdentity: 'pending',
  // Also the `locale` hint sent to session/ensure, so the server derives the
  // session language from the shopper's own preference rather than a hardcoded
  // 'en' (PLN-260813 P4).
  language: initialLanguage(),
  consent: null,
  pendingChatMessage: null,
  notificationFilter: 'all',
  chatUnread: 0,
  setSessionToken: (t) => {
    setStoredSessionToken(t);
    set({ sessionToken: t });
  },
  setActiveTab: (t) => set({ activeTab: t, chatUnread: t === 'chat' ? 0 : get().chatUnread }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setAuthenticated: (v) => set({ authenticated: v }),
  setAuthPending: (v) => set({ authPending: v }),
  setLoginMode: (m) => set({ loginMode: m }),
  setWidgetCopy: (c) => set({ widgetCopy: c }),
  setCustomerName: (n) => set({ customerName: n }),
  setEmbedIdentity: (v) => set({ embedIdentity: v }),
  setLanguage: (l) => set({ language: l }),
  setConsentInfo: (c) => set({ consent: c }),
  setNotificationFilter: (f) => set({ notificationFilter: f }),
  bumpChatUnread: (n) => set((s) => ({ chatUnread: s.chatUnread + n })),
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
