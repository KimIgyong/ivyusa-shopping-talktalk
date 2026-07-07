import { apiClient } from '../lib/api-client';
import type { ChatReply, Conversation, ScenarioReply } from '../lib/types';

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

/** Scenario button / quick-reply → deterministic scripted reply (FR-S1). */
export function sendScenario(
  sessionToken: string,
  action: string,
): Promise<ScenarioReply> {
  return apiClient.post<ScenarioReply>('/chat/scenario', {
    session_token: sessionToken,
    action,
  });
}
