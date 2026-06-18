import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  escalate as escalateApi,
  getConversation,
  sendMessage,
} from '../services/chatService';
import type { ChatMessage, ChatReply } from '../lib/types';

export interface SendResult {
  escalate: boolean;
  needsAuth: boolean;
}

/**
 * Local-first chat thread. Seeds from the conversation endpoint, then keeps
 * an optimistic local message list as the user chats.
 */
export function useChat(sessionToken: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useQuery({
    queryKey: ['conversation', sessionToken],
    queryFn: async () => {
      const conv = await getConversation(sessionToken!);
      setConversationId(conv.conversationId);
      if (conv.messages?.length) setMessages(conv.messages);
      setSeeded(true);
      return conv;
    },
    enabled: !!sessionToken && !seeded,
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
      const now = new Date().toISOString();
      append({
        id: `local-${Date.now()}`,
        senderType: 'user',
        body: text,
        createdAt: now,
      });
      setSending(true);
      try {
        const reply: ChatReply = await sendMessage(sessionToken, text);
        setConversationId(reply.conversationId);
        append({
          id: `reply-${Date.now()}`,
          senderType: reply.reply.senderType,
          body: reply.reply.body,
          createdAt: new Date().toISOString(),
          citations: reply.reply.citations,
        });
        return { escalate: reply.escalate, needsAuth: reply.needsAuth };
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

  return { messages, send, sending, escalate, append, conversationId };
}
