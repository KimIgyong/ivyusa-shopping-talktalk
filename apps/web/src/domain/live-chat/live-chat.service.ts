import { apiGet, apiPatch, apiPost } from '@/lib/api-client';

/** Mirrors the API's toSessionResponse — no invented fields (they render as '—'). */
export interface AgentSession {
  id: string;
  /** Session behind the row (row ids are conversation ids). */
  sessionId?: string;
  /** Operator-set session name; shown ahead of the derived one. */
  alias?: string | null;
  /** Session auto-reply choice: inherit | on | off. */
  autoReplyMode?: string;
  /** That choice resolved against the channel default — is the AI answering? */
  autoReplyEffective?: boolean;
  customerName?: string | null;
  /** Shown when the shopper left an address but no name (off-hours capture). */
  customerEmail?: string | null;
  status?: string;
  /** Origin surface: widget | telegram | viber | zalo | line | kakao | sms | email … */
  channel?: string | null;
  escalated?: boolean;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  createdAt?: string;
}

export type MessageSenderType = 'user' | 'agent' | 'ai' | 'system';

/** What the knowledge base says, with the documents it stood on (PLN-260810 S2). */
export interface AgentKnowledgeAnswer {
  answer: string;
  confidence: number;
  blocked: boolean;
  sources: Array<{
    id: number;
    title: string;
    category: string | null;
    similarity: number | null;
    snippet: string;
    source: string | null;
    stale: boolean;
    conflicted: boolean;
  }>;
}

export interface ChatMessage {
  id: string;
  senderType: MessageSenderType;
  senderName?: string | null;
  body: string;
  createdAt?: string;
}

export interface CustomerContext {
  id?: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  tier?: string | null;
  recentOrders?: { id: number; status?: string | null; total?: number | null; createdAt?: string }[];
}

export interface ConversationDetail {
  conversationId?: number;
  sessionId?: string;
  alias?: string | null;
  autoReplyMode?: string;
  autoReplyEffective?: boolean;
  status?: string;
  /** Origin surface — the composer is disabled on receive-only channels. */
  channel?: string | null;
  assignedTo?: string | null;
  messages: ChatMessage[];
  /** Older messages exist before the first one returned (PLN-260807). */
  hasMore?: boolean;
  customer?: CustomerContext | null;
}

export interface CustomerLead {
  name?: string;
  email?: string;
  phone?: string;
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
  sessions: (q?: string, status?: string, channel?: string) =>
    apiGet<AgentSession[]>('/agent/sessions', {
      ...(q?.trim() ? { q: q.trim() } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(channel && channel !== 'all' ? { channel } : {}),
    }),
  setAlias: (id: string, alias: string | null) =>
    apiPatch<{ sessionId: string; alias: string | null }>(`/agent/conversations/${id}/alias`, {
      alias,
    }),
  setAutoReply: (id: string, mode: string) =>
    apiPatch<{ sessionId: string; autoReplyMode: string; autoReplyEffective: boolean }>(
      `/agent/conversations/${id}/auto-reply`,
      { mode },
    ),
  conversation: (id: string, beforeId?: string) =>
    apiGet<ConversationDetail>(
      `/agent/conversations/${id}`,
      beforeId ? { before_id: beforeId } : undefined,
    ),
  // Separate call on purpose: it runs a summarisation model, and the transcript
  // must not wait for it (PLN-260807 D1).
  briefing: (id: string) => apiGet<{ briefing: string }>(`/agent/conversations/${id}/briefing`),
  accept: (id: string) => apiPost<ConversationDetail>(`/agent/conversations/${id}/accept`),
  sendMessage: (id: string, body: string) =>
    apiPost<ChatMessage>(`/agent/conversations/${id}/message`, { body }),
  end: (id: string) => apiPost<ConversationDetail>(`/agent/conversations/${id}/end`),
  /** Read-only knowledge lookup for chat handlers (PLN-260810 S2). */
  askKnowledge: (question: string, language: string) =>
    apiPost<AgentKnowledgeAnswer>('/agent/knowledge/ask', { question, language }),
  /** Propose an answer for the knowledge base — awaits an owner's approval (S4). */
  proposeAnswer: (body: { conversation_id?: number; question: string; answer: string }) =>
    apiPost<{ id: string }>('/agent/knowledge/proposals', body),
  /** Return the thread to the AI without ending it (PLN-260810 S1). */
  handBack: (id: string) =>
    apiPost<{ id: string; status: string }>(`/agent/conversations/${id}/handback`, {}),
  alerts: (status = 'new') => apiGet<AgentAlert[]>(`/agent/alerts?status=${status}`),
  ackAlert: (id: string) => apiPost<AgentAlert>(`/agent/alerts/${id}/ack`),
  searchCustomers: (q: string) =>
    apiGet<CustomerContext[]>(`/agent/customers/search`, { q }),
  linkCustomer: (id: string, customerId: number) =>
    apiPost<CustomerContext>(`/agent/conversations/${id}/link-customer`, { customer_id: customerId }),
  createCustomer: (id: string, lead: CustomerLead) =>
    apiPost<CustomerContext>(`/agent/conversations/${id}/create-customer`, lead),
};
