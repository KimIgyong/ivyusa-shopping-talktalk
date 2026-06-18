import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Headphones } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { useChat } from '../../hooks/useChat';
import { setConsent } from '../../services/sessionService';
import { MessageBubble } from './MessageBubble';
import { ConsentBanner } from './ConsentBanner';
import { ScenarioMenu, type ScenarioAction } from './ScenarioMenu';
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

  const { messages, send, sending, escalate } = useChat(sessionToken);

  const [consented, setConsented] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === 'granted';
    } catch {
      return false;
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
    setConsented(granted);
    if (sessionToken) setConsent(sessionToken, granted).catch(() => {});
  }

  async function doSend(text: string) {
    const res = await send(text);
    setShowEscalate(res.escalate);
    if (res.needsAuth && !authenticated) setInline('auth');
  }

  // Auto-send a message queued from another tab (e.g. "Ask about this order").
  useEffect(() => {
    if (!pendingChatMessage || !consented || !sessionToken) return;
    const msg = consumeChatMessage();
    if (msg) void doSend(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatMessage, consented, sessionToken]);

  async function handleScenario(a: ScenarioAction) {
    switch (a) {
      case 'delivery':
      case 'myOrders':
        if (!authenticated) {
          setInline('auth');
        } else {
          setActiveTab('orders');
        }
        return;
      case 'contact':
        setInline('contact');
        return;
      case 'affiliate':
        setInline('affiliate');
        return;
      case 'cancelRefund':
        return doSend(t('chat.templates.cancelRefund'));
      case 'usage':
        return doSend(t('chat.templates.usage'));
      case 'ingredients':
        return doSend(t('chat.templates.ingredients'));
      case 'exchange':
        return doSend(t('chat.templates.exchange'));
      case 'restock':
        return doSend(t('chat.templates.restock'));
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
        className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3"
      >
        {!consented && (
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

        {consented && <ScenarioMenu onAction={handleScenario} />}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
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
          disabled={!consented}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={!consented || sending || !input.trim()}
          aria-label={t('chat.send')}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
