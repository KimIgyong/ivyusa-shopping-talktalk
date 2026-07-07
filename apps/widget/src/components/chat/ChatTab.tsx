import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { useChat } from '../../hooks/useChat';
import { useScenario } from '../../hooks/useScenario';
import { setConsent } from '../../services/sessionService';
import type { ScenarioButton } from '../../lib/types';
import { MessageBubble } from './MessageBubble';
import { ConsentBanner } from './ConsentBanner';
import { ScenarioMenu, type SubAction } from './ScenarioMenu';
import { AuthGate } from './AuthGate';
import { ContactCard } from './ContactCard';
import { AffiliateCard } from './AffiliateCard';

const CONSENT_KEY = 'ivy_consent';

type Inline = 'auth' | 'contact' | 'affiliate' | null;

export function ChatTab() {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const setActiveTab = useWidgetStore((s) => s.setActiveTab);
  const pendingChatMessage = useWidgetStore((s) => s.pendingChatMessage);
  const consumeChatMessage = useWidgetStore((s) => s.consumeChatMessage);

  const { messages, send, scenario, sending, escalate } = useChat(sessionToken);
  const scenarioButtons = useScenario(sessionToken);

  // CCPA notice choice. Guests may chat (non-personal product/FAQ) regardless of
  // the choice (FN-008); the banner just shows until a choice is recorded.
  const [consentChoice, setConsentChoice] = useState<'granted' | 'denied' | null>(() => {
    try {
      const v = localStorage.getItem(CONSENT_KEY);
      return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : null;
    } catch {
      return null;
    }
  });
  const [input, setInput] = useState('');
  const [inline, setInline] = useState<Inline>(null);
  const [showEscalate, setShowEscalate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, inline, showEscalate]);

  function recordConsent(granted: boolean) {
    try {
      localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    } catch {
      /* ignore */
    }
    setConsentChoice(granted ? 'granted' : 'denied');
    if (sessionToken) setConsent(sessionToken, granted).catch(() => {});
  }

  async function doSend(text: string) {
    const res = await send(text);
    setShowEscalate(res.escalate);
    if (res.needsAuth && !authenticated) setInline('auth');
  }

  // Auto-send a message queued from another tab (e.g. "Ask about this order").
  useEffect(() => {
    if (!pendingChatMessage || !sessionToken) return;
    const msg = consumeChatMessage();
    if (msg) void doSend(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatMessage, sessionToken]);

  function handleScenario(button: ScenarioButton) {
    switch (button.action) {
      case 'delivery_status':
        // Scripted shipping scenario (FR-S1); order tracking via follow-up chip.
        void scenario('shipping_policy', button.label);
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
        void scenario('cancel_refund', button.label);
        return;
      case 'message':
      default:
        // Custom button: send its label as a chat message (RAG path).
        void doSend(button.label);
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
        void escalate();
        return;
      case 'my_orders':
        if (!authenticated) setInline('auth');
        else setActiveTab('orders');
        return;
      default:
        void scenario(id, label);
        return;
    }
  }

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
        {consentChoice === null && (
          <ConsentBanner
            onAccept={() => recordConsent(true)}
            onDecline={() => recordConsent(false)}
          />
        )}

        {/* Welcome bubble */}
        <MessageBubble
          message={{
            id: 'welcome',
            senderType: 'ai',
            body: t('chat.welcome'),
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
