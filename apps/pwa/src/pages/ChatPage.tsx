import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getConversation,
  getScenarioButtons,
  sendMessage,
  sendScenario,
} from '../services/chatService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import type { ChatMessage } from '../lib/types';

/** Foreground chat poll (parity with widget/RN POLL_MS); push covers background. */
const POLL_MS = 5000;

export default function ChatPage() {
  const { t } = useTranslation();
  const { token, session, grantConsent } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Poll only while the tab is visible; the route being active is implied by mount.
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const consented = session?.consentState === 'granted' && !session?.noticeOutdated;

  const conversationQuery = useQuery({
    queryKey: ['conversation', token],
    enabled: !!token && consented,
    refetchInterval: pageVisible ? POLL_MS : false,
    queryFn: () => getConversation(token!),
  });

  const scenarioQuery = useQuery({
    queryKey: ['scenario', token],
    enabled: !!token && consented,
    staleTime: 5 * 60_000,
    queryFn: () => getScenarioButtons(token!),
  });

  const refetchConversation = () => qc.invalidateQueries({ queryKey: ['conversation', token] });

  const sendMut = useMutation({
    mutationFn: (message: string) => sendMessage(token!, message),
    onSuccess: async (reply) => {
      if (reply.needsAuth) toast.show(t('chat.needsAuth'), 'error');
      if (reply.escalate) toast.show(t('chat.escalated'));
      await refetchConversation();
    },
    onError: () => toast.show(t('chat.sendFailed'), 'error'),
  });

  const scenarioMut = useMutation({
    mutationFn: (action: string) => sendScenario(token!, action),
    onSuccess: () => refetchConversation(),
    onError: () => toast.show(t('chat.sendFailed'), 'error'),
  });

  const messages = conversationQuery.data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !token || sendMut.isPending) return;
    setDraft('');
    sendMut.mutate(text);
  };

  const agree = async () => {
    try {
      await grantConsent();
      toast.show(t('chat.consentSaved'));
    } catch {
      toast.show(t('chat.consentFailed'), 'error');
    }
  };

  if (!session) {
    return <div className="page-center hint">{t('common.loading')}</div>;
  }

  if (!consented) {
    return (
      <div className="consent-panel">
        <h2 className="consent-title">{t('chat.consentTitle')}</h2>
        <p className="consent-body">{t('chat.consentBody')}</p>
        {session.privacyPolicyUrl ? (
          <a
            className="consent-link"
            href={session.privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('chat.consentPolicy')}
          </a>
        ) : null}
        <button type="button" className="btn btn-primary btn-block" onClick={() => void agree()}>
          {t('chat.consentAgree')}
        </button>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-messages">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      {scenarioQuery.data?.scenarioButtons?.length ? (
        <div className="chat-chips">
          {scenarioQuery.data.scenarioButtons
            .filter((b) => b.enabled)
            .map((b) => (
              <button
                key={b.id}
                type="button"
                className="chip"
                onClick={() => scenarioMut.mutate(b.action)}
              >
                {b.label}
              </button>
            ))}
        </div>
      ) : null}
      <form className="chat-input-row" onSubmit={submit}>
        <input
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
        />
        <button type="submit" className="btn btn-primary" disabled={sendMut.isPending}>
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.senderType === 'user';
  return (
    <div className={`bubble-row ${mine ? 'row-mine' : 'row-theirs'}`}>
      <div className={`bubble ${mine ? 'bubble-mine' : 'bubble-theirs'}`}>
        {!mine && message.senderName ? (
          <div className="bubble-sender">{message.senderName}</div>
        ) : null}
        <div className="bubble-body">{message.body}</div>
      </div>
    </div>
  );
}
