import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { useChat } from '../../hooks/useChat';
import { useScenario } from '../../hooks/useScenario';
import { getShopDomain } from '../../hooks/useSession';
import { ensureSession, setConsent } from '../../services/sessionService';
import { getStoredConsent, setStoredConsent } from '../../lib/consent';
import { useAnalytics } from '../../lib/analytics';
import type { ScenarioButton, ScenarioPostAction, WidgetCopyText } from '../../lib/types';
import { MessageBubble } from './MessageBubble';
import { TypingBubble } from './TypingBubble';
import { ContactEmailCard } from './ContactEmailCard';
import { ConsentBanner } from './ConsentBanner';
import { ScenarioMenu, type SubAction } from './ScenarioMenu';
import { AuthGate } from './AuthGate';
import { ContactCard } from './ContactCard';
import { AffiliateCard } from './AffiliateCard';

type Inline = 'auth' | 'contact' | 'affiliate' | 'contactEmail' | null;

/** Pick the tenant-configured copy for the active language, if any. */
function pickCopy(bag: WidgetCopyText | undefined, language: string): string | null {
  const key = (language || 'en').toUpperCase() as keyof WidgetCopyText;
  return bag?.[key]?.trim() || null;
}

/** Substitute a template placeholder everywhere (ES2020-safe replaceAll). */
function fill(template: string, key: string, value: string): string {
  return template.split(key).join(value);
}

export function ChatTab() {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const customerName = useWidgetStore((s) => s.customerName);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const setActiveTab = useWidgetStore((s) => s.setActiveTab);
  const setSessionToken = useWidgetStore((s) => s.setSessionToken);
  const setSettingsOpen = useWidgetStore((s) => s.setSettingsOpen);
  const consent = useWidgetStore((s) => s.consent);
  const updateConsentState = useWidgetStore((s) => s.updateConsentState);
  const language = useWidgetStore((s) => s.language);
  const pendingChatMessage = useWidgetStore((s) => s.pendingChatMessage);
  const consumeChatMessage = useWidgetStore((s) => s.consumeChatMessage);
  const analytics = useAnalytics();

  const { messages, send, scenario, sending, status, escalate } = useChat(sessionToken);
  // Reply-pending indicator (PLN-260804, corrected by FIX-260806).
  //  · sending  → the AI completion runs synchronously inside the send request.
  //  · agent    → a human took the thread; their reply arrives via the poll.
  //  · waiting  → handed off but nobody has picked it up. This is NOT someone
  //    typing: the bot deliberately stays silent in this state, so an animated
  //    "an agent is writing…" made a queued thread look like an imminent reply
  //    and left the shopper watching dots indefinitely.
  const waitMode: 'ai' | 'agent' | 'queued' | null = sending
    ? 'ai'
    : status === 'agent' && messages[messages.length - 1]?.senderType === 'user'
      ? 'agent'
      : status === 'waiting'
        ? 'queued'
        : null;
  const scenarioButtons = useScenario(sessionToken);

  // CCPA notice choice — local cache only used until session/ensure reports the
  // server-side state (the server is the source of truth; see showConsentBanner).
  const [consentChoice, setConsentChoice] = useState<'granted' | 'denied' | null>(
    () => getStoredConsent(),
  );
  const [input, setInput] = useState('');
  const [inline, setInline] = useState<Inline>(null);
  const [showEscalate, setShowEscalate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tenant-configured greetings (session/ensure); fall back to the built-in
  // defaults with {shop} = tenant display name (no hardcoded brand — a second
  // tenant's shoppers must never be welcomed to "IVY USA").
  const widgetCopy = useWidgetStore((s) => s.widgetCopy);
  const shopName = widgetCopy?.displayName || t('appName');
  const greetingFor = (name: string | null): string => {
    if (name) {
      const custom = pickCopy(widgetCopy?.loginGreeting, language);
      return custom
        ? fill(fill(custom, '{name}', name), '{shop}', shopName)
        : t('chat.welcomeNamed', { name, shop: shopName });
    }
    const custom = pickCopy(widgetCopy?.firstVisit, language);
    return custom ? fill(custom, '{shop}', shopName) : t('chat.welcome', { shop: shopName });
  };

  // Requirement 4 (PLN-260808-Widget-Greetings): when the shopper signs in
  // mid-conversation, greet them by name once. Render-only — never persisted.
  const [loginGreeting, setLoginGreeting] = useState<string | null>(null);
  const prevNameRef = useRef<string | null>(customerName);
  useEffect(() => {
    if (!prevNameRef.current && customerName && messages.length > 0) {
      setLoginGreeting(greetingFor(customerName));
    }
    prevNameRef.current = customerName;
    // greetingFor is stable enough for this transition-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, inline, showEscalate, waitMode]);

  /**
   * Fail-closed consent recording (ConsentBanner awaits this): the banner only
   * dismisses after the server acknowledged the choice. Also refreshes the
   * local cache that gates GA4 before the next ensure.
   */
  async function recordConsent(granted: boolean): Promise<void> {
    let token = sessionToken;
    if (!token) {
      // Session may not exist yet (e.g. first ensure failed) — establish one.
      const res = await ensureSession(null, language, getShopDomain());
      token = res.sessionToken;
      setSessionToken(token);
    }
    const result = await setConsent(token, granted);
    setStoredConsent(granted, result.consentVersion);
    setConsentChoice(granted ? 'granted' : 'denied');
    updateConsentState(
      granted ? 'granted' : 'declined',
      new Date().toISOString(),
      result.consentVersion,
    );
  }

  // Server truth wins; an outdated notice version re-prompts regardless of the
  // local cache. Before the first ensure resolves (or offline), fall back to
  // the local choice.
  const showConsentBanner = consent
    ? consent.state === 'pending' || consent.noticeOutdated
    : consentChoice === null;

  async function doSend(text: string, via: 'input' | 'scenario' | 'quick_reply' = 'input') {
    analytics.chatStart();
    analytics.messageSent(via);
    const res = await send(text);
    setShowEscalate(res.escalate);
    if (res.needsAuth && !authenticated) setInline('auth');
    // Handed off outside business hours and we hold no address: the reply has
    // to travel by email, so ask before the shopper walks away (PLN-260806).
    else if (res.needsContactEmail) setInline('contactEmail');
  }

  // Auto-send a message queued from another tab (e.g. "Ask about this order").
  useEffect(() => {
    if (!pendingChatMessage || !sessionToken) return;
    const msg = consumeChatMessage();
    if (msg) void doSend(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatMessage, sessionToken]);

  function handleScenario(button: ScenarioButton) {
    analytics.scenarioClick(button.action, button.label);
    switch (button.action) {
      case 'delivery_status':
        // Scripted shipping scenario (FR-S1); order tracking via follow-up chip.
        void scenario('shipping_policy', button.label).then(runPostAction);
        return;
      case 'my_orders':
        if (!authenticated) {
          setInline('auth');
        } else {
          setActiveTab('orders');
        }
        return;
      case 'contact_support':
        setInline('contact');
        return;
      case 'affiliate':
        setInline('affiliate');
        return;
      case 'cancel_refund':
        void scenario('cancel_refund', button.label).then(runPostAction);
        return;
      case 'message':
      default:
        // Custom button: send its label as a chat message (RAG path).
        void doSend(button.label);
        return;
    }
  }

  /**
   * Tenant-configured navigation after a scripted reply (PLN-AiSetting W2).
   * Mirrors the scenario-button destinations so an admin can send a shopper
   * straight to their orders, the contact form, or an external page.
   */
  function runPostAction(post?: ScenarioPostAction) {
    if (!post || post.type === 'none') return;
    switch (post.type) {
      case 'open_orders':
        if (!authenticated) setInline('auth');
        else setActiveTab('orders');
        return;
      case 'open_contact':
        setInline('contact');
        return;
      case 'open_affiliate':
        setInline('affiliate');
        return;
      case 'connect_agent':
        void escalate();
        return;
      case 'open_url':
        // noopener/noreferrer: the destination is tenant-supplied.
        if (post.url) window.open(post.url, '_blank', 'noopener,noreferrer');
        return;
    }
  }

  function handleSubAction(a: SubAction) {
    switch (a) {
      case 'usage':
        return doSend(t('chat.templates.usage'));
      case 'ingredients':
        return doSend(t('chat.templates.ingredients'));
      case 'exchange':
        return void scenario('return_exchange', t('chat.templates.exchange'));
      case 'restock':
        return doSend(t('chat.templates.restock'));
    }
  }

  /** Scenario follow-up chip clicks: control actions or another script. */
  function handleQuickReply(id: string, label: string) {
    switch (id) {
      case 'agent_connect':
        setShowEscalate(false);
        analytics.escalate();
        void escalate();
        return;
      case 'my_orders':
        if (!authenticated) setInline('auth');
        else setActiveTab('orders');
        return;
      default:
        void scenario(id, label).then(runPostAction);
        return;
    }
  }

  /**
   * Follow-ups shown when a reply arrives without its own chips (the RAG path has
   * none). Without this the thread auto-scrolls to a bottom that has nothing to
   * act on — the scenario menu is far above, out of view — so a shopper who asked
   * about an order hits a dead end. Ids match handleQuickReply/scenario handling.
   */
  const lastMessage = messages[messages.length - 1];
  const showFallbackActions =
    !!lastMessage &&
    lastMessage.senderType !== 'user' &&
    !lastMessage.quickReplies?.length &&
    !sending &&
    !showEscalate &&
    inline === null;
  const fallbackActions: { id: string; label: string }[] = [
    { id: 'my_orders', label: t('chat.nextActions.myOrders') },
    { id: 'shipping_policy', label: t('chat.nextActions.shipping') },
    { id: 'return_exchange', label: t('chat.nextActions.returns') },
    { id: 'agent_connect', label: t('chat.nextActions.agent') },
  ];

  function submitInput(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input;
    setInput('');
    void doSend(text);
  }

  return (
    <div className="flex h-full flex-col">
      {/* AI disclosure */}
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
        <Sparkles className="h-3 w-3 text-primary-400" />
        {t('chat.aiDisclosure')}
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={sending}
        aria-label={t('a11y.messageThread')}
        className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3"
      >
        {showConsentBanner && (
          <ConsentBanner
            version={consent?.noticeVersion}
            privacyPolicyUrl={consent?.privacyPolicyUrl}
            noticeOutdated={consent?.noticeOutdated}
            onAccept={() => recordConsent(true)}
            onDecline={() => recordConsent(false)}
            onOpenPrivacySettings={() => setSettingsOpen(true)}
          />
        )}

        {/* Welcome bubble — tenant-configured copy; greets by name when known. */}
        <MessageBubble
          message={{
            id: 'welcome',
            senderType: 'ai',
            body: greetingFor(customerName),
            createdAt: new Date().toISOString(),
          }}
        />

        <ScenarioMenu
          buttons={scenarioButtons}
          onScenario={handleScenario}
          onSubAction={handleSubAction}
        />

        {messages.map((m, i) => (
          <div key={m.id} className="space-y-2">
            <MessageBubble message={m} />
            {/* Scenario follow-up chips on the latest message only (FR-S1). */}
            {i === messages.length - 1 && !!m.quickReplies?.length && (
              <div className="flex flex-wrap gap-1.5 pl-1">
                {m.quickReplies.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleQuickReply(q.id, q.label)}
                    disabled={sending}
                    className="rounded-full border border-primary-300 bg-white px-3 py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-500/10 disabled:opacity-40"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Sign-in greeting for a mid-conversation login (render-only, once). */}
        {loginGreeting && (
          <MessageBubble
            message={{
              id: 'login-greeting',
              senderType: 'ai',
              body: loginGreeting,
              createdAt: new Date().toISOString(),
            }}
          />
        )}

        {waitMode && <TypingBubble mode={waitMode} />}

        {showFallbackActions && (
          <div className="flex flex-wrap gap-1.5 pl-1">
            {fallbackActions.map((a) => (
              <button
                key={a.id}
                onClick={() => handleQuickReply(a.id, a.label)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-primary-300 hover:text-primary-600"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {inline === 'auth' && (
          <AuthGate
            sessionToken={sessionToken}
            onSuccess={() => {
              setAuthenticated(true);
              setInline(null);
            }}
            onCancel={() => setInline(null)}
          />
        )}
        {inline === 'contactEmail' && (
          <ContactEmailCard sessionToken={sessionToken} onSaved={() => setInline(null)} />
        )}
        {inline === 'contact' && (
          <ContactCard
            onChatAgent={() => {
              setInline(null);
              setShowEscalate(true);
              void escalate();
            }}
          />
        )}
        {inline === 'affiliate' && (
          <AffiliateCard sessionToken={sessionToken} />
        )}

        {showEscalate && (
          <button
            onClick={() => {
              setShowEscalate(false);
              void escalate();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary-400 bg-primary-500/5 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-500/10"
          >
            <Headphones className="h-4 w-4" />
            {t('chat.connectAgent')}
          </button>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={submitInput}
        className="flex items-center gap-2 border-t border-gray-100 p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.inputPlaceholder')}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t('chat.send')}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
