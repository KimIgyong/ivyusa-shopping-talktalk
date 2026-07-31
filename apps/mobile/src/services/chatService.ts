import { apiClient } from '../lib/api-client';
import type { ChatReply, Conversation, ScenarioButton, ScenarioReply } from '../lib/types';

export function getConversation(
  sessionToken: string,
  afterId?: string | null,
): Promise<Conversation> {
  return apiClient.get<Conversation>('/chat/conversation', sessionToken, {
    after_id: afterId ?? undefined,
  });
}

export function sendMessage(sessionToken: string, message: string): Promise<ChatReply> {
  return apiClient.post<ChatReply>('/chat/message', { session_token: sessionToken, message });
}

export function sendScenario(sessionToken: string, action: string): Promise<ScenarioReply> {
  return apiClient.post<ScenarioReply>('/chat/scenario', { session_token: sessionToken, action });
}

export function escalate(sessionToken: string, conversationId: string): Promise<unknown> {
  return apiClient.post('/chat/escalate', {
    session_token: sessionToken,
    conversation_id: conversationId,
  });
}

export function getScenarioButtons(sessionToken: string): Promise<{ scenarioButtons: ScenarioButton[] }> {
  return apiClient.get<{ scenarioButtons: ScenarioButton[] }>('/ai-config/scenario', sessionToken);
}
