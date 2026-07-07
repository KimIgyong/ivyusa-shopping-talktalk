import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  escalate as escalateApi,
  getConversation,
  sendMessage,
  sendScenario,
} from '../services/chatService';
import type { ChatMessage, ChatReply } from '../lib/types';

export interface SendResult {
  escalate: boolean;
  needsAuth: boolean;
}

const POLL_MS = 5000;

/**
 * Chat thread state. Optimistic local appends while sending, plus a 5s
 * conversation poll so agent replies after a handoff reach the customer
 * (FR-S4). Server messages win on reconcile; local optimistic messages are
 * kept only while a send is in flight.
 */
export function useChat(sessionToken: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Ref (not state) so the polling queryFn always sees the current value.
  const inFlight = useRef(false);

  useQuery({
    queryKey: ['conversation', sessionToken],
    queryFn: async () => {
      const conv = await getConversation(sessionToken!);
      if (!inFlight.current) {
        setConversationId(conv.conversationId);
        setMessages((prev) => reconcile(prev, conv.messages ?? []));
      }
      return conv;
    },
    enabled: !!sessionToken,
    refetchInterval: POLL_MS,
    retry: false,
  });

  const append = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const send = useCallback(
    async (text: string): Promise<SendResult> => {
      if (!sessionToken || !text.trim()) {
        return { escalate: false, needsAuth: false };
      }
      append({
        id: `local-${Date.now()}`,
        senderType: 'user',
        body: text,
        createdAt: new Date().toISOString(),
      });
      setSending(true);
      inFlight.current = true;
      try {
        const res: ChatReply = await sendMessage(sessionToken, text);
        setConversationId(res.conversationId);
        // reply === null → agent mode: the human reply arrives via polling.
        if (res.reply) {
          append({
            id: `reply-${Date.now()}`,
            senderType: res.reply.senderType,
            body: res.reply.body,
            createdAt: new Date().toISOString(),
            citations: res.reply.citations,
          });
        }
        return { escalate: res.escalate, needsAuth: res.needsAuth };
      } catch (e) {
        append({
          id: `err-${Date.now()}`,
          senderType: 'system',
          body:
            e instanceof Error
              ? `Sorry, something went wrong: ${e.message}`
              : 'Sorry, something went wrong.',
          createdAt: new Date().toISOString(),
        });
        return { escalate: false, needsAuth: false };
      } finally {
        setSending(false);
        inFlight.current = false;
      }
    },
    [sessionToken, append],
  );

  /** Scenario button / quick-reply chip (FR-S1): deterministic scripted turn. */
  const scenario = useCallback(
    async (action: string, label: string): Promise<void> => {
      if (!sessionToken) return;
      append({
        id: `local-${Date.now()}`,
        senderType: 'user',
        body: label,
        createdAt: new Date().toISOString(),
      });
      setSending(true);
      inFlight.current = true;
      try {
        const res = await sendScenario(sessionToken, action);
        setConversationId(res.conversationId);
        append({
          id: `scen-${Date.now()}`,
          senderType: res.reply.senderType,
          body: res.reply.body,
          createdAt: new Date().toISOString(),
          quickReplies: res.followUps,
        });
      } catch {
        append({
          id: `err-${Date.now()}`,
          senderType: 'system',
          body: 'Sorry, something went wrong.',
          createdAt: new Date().toISOString(),
        });
      } finally {
        setSending(false);
        inFlight.current = false;
      }
    },
    [sessionToken, append],
  );

  const escalate = useCallback(async () => {
    if (!conversationId) return;
    await escalateApi(conversationId);
    append({
      id: `sys-${Date.now()}`,
      senderType: 'system',
      body: 'You are being connected to a support agent. Please hold on…',
      createdAt: new Date().toISOString(),
    });
  }, [conversationId, append]);

  return { messages, send, scenario, sending, escalate, append, conversationId };
}

/**
 * Merge the server thread with local state. Server is the source of truth;
 * quickReplies chips exist only locally (the server does not return them on
 * the conversation read), so they are re-attached to the matching message.
 */
function reconcile(local: ChatMessage[], server: ChatMessage[]): ChatMessage[] {
  if (server.length === 0) return local;
  if (server.length < countServerKnown(local)) return local; // stale poll
  const lastWithChips = [...local].reverse().find((m) => m.quickReplies?.length);
  return server.map((m) =>
    lastWithChips && m.body === lastWithChips.body && m.senderType === lastWithChips.senderType
      ? { ...m, quickReplies: lastWithChips.quickReplies }
      : m,
  );
}

function countServerKnown(local: ChatMessage[]): number {
  return local.filter((m) => !m.id.startsWith('local-') && !m.id.startsWith('err-')).length;
}
