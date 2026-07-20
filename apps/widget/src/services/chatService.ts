import { apiClient } from '../lib/api-client';
import type { ChatReply, Conversation, ScenarioReply } from '../lib/types';

export function getConversation(
  sessionToken: string,
  afterId?: string | null,
): Promise<Conversation> {
  // Token travels in X-Session-Token (via the api-client interceptor), not the URL.
  return apiClient.get<Conversation>('/chat/conversation', {
    session_token: sessionToken,
    after_id: afterId ?? undefined,
  });
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

export function escalate(sessionToken: string, conversationId: string): Promise<unknown> {
  return apiClient.post('/chat/escalate', {
    session_token: sessionToken,
    conversation_id: conversationId,
  });
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
