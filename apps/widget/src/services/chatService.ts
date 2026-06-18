import { apiClient } from '../lib/api-client';
import type { ChatReply, Conversation } from '../lib/types';

export function getConversation(sessionToken: string): Promise<Conversation> {
  return apiClient.get<Conversation>(`/chat/conversation/${sessionToken}`);
}

export function sendMessage(
  sessionToken: string,
  message: string,
): Promise<ChatReply> {
  return apiClient.post<ChatReply>('/chat/message', {
    session_token: sessionToken,
    message,
  });
}

export function escalate(conversationId: string): Promise<unknown> {
  return apiClient.post('/chat/escalate', { conversation_id: conversationId });
}
