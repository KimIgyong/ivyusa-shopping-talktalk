import { apiGet, apiPost } from '@/lib/api-client';

export interface AgentSession {
  id: string;
  customerName?: string;
  channel?: string;
  status?: string;
  lastMessage?: string;
  updatedAt?: string;
  unread?: number;
}

export interface ChatMessage {
  id: string;
  role: 'customer' | 'agent' | 'ai' | 'system';
  body: string;
  createdAt?: string;
}

export interface CustomerContext {
  name?: string;
  email?: string;
  phone?: string;
  tier?: string;
  recentOrders?: { id: string; status: string; total?: number; createdAt?: string }[];
}

export interface ConversationDetail {
  id: string;
  status?: string;
  assignedTo?: string | null;
  briefing?: string;
  messages: ChatMessage[];
  customer?: CustomerContext;
}

/** Escalation alert row (FR-S3) shown in the console alarm modal. */
export interface AgentAlert {
  id: string;
  conversationId: string;
  sessionId?: string | null;
  reason: 'low_confidence' | 'moderation_blocked' | 'user_request' | string;
  preview?: string | null;
  status: 'new' | 'acked' | string;
  createdAt?: string;
}

export const liveChatService = {
  sessions: () => apiGet<AgentSession[]>('/agent/sessions'),
  conversation: (id: string) => apiGet<ConversationDetail>(`/agent/conversations/${id}`),
  accept: (id: string) => apiPost<ConversationDetail>(`/agent/conversations/${id}/accept`),
  sendMessage: (id: string, body: string) =>
    apiPost<ChatMessage>(`/agent/conversations/${id}/message`, { body }),
  end: (id: string) => apiPost<ConversationDetail>(`/agent/conversations/${id}/end`),
  alerts: (status = 'new') => apiGet<AgentAlert[]>(`/agent/alerts?status=${status}`),
  ackAlert: (id: string) => apiPost<AgentAlert>(`/agent/alerts/${id}/ack`),
};
