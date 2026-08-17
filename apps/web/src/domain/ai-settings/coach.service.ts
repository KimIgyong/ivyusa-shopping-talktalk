import { apiDelete, apiGet, apiGetList, apiPost } from '@/lib/api-client';

/**
 * Agent coaching channel (REQ/PLN-260804 W1/W2). Separate from preview.service:
 * there the admin plays the shopper, here they talk to the agent about its own
 * behavior and approve the config changes it proposes.
 */

export type ProposalType =
  | 'persona_patch'
  | 'rule_add'
  | 'rule_edit'
  | 'rule_remove'
  | 'kb_upsert'
  | 'scenario_override';
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'superseded' | 'reverted';

export interface CoachCitation {
  id: number;
  title: string;
  similarity: number | null;
}

export interface CoachRefTurn {
  messageId: number;
  question: string;
  answer: string;
  confidence: number | null;
  citations: CoachCitation[];
}

export interface CoachMessage {
  id: number;
  role: 'user' | 'agent' | 'system';
  body: string;
  citations: CoachCitation[];
  blocked: boolean;
  /** Provider that actually produced this turn — 'stub' means no real model ran. */
  provider: string | null;
  refTurn: CoachRefTurn | null;
  createdAt: string;
}

export interface CoachProposal {
  id: number;
  messageId: number;
  type: ProposalType;
  status: ProposalStatus;
  persona: string | null;
  rule: string | null;
  targetRule: string | null;
  rationale: string | null;
  conflictsWith: string[];
  appliedAt: string | null;
  /** kb_upsert — docId null means the proposal creates a new document. */
  docId: number | null;
  docTitle: string | null;
  docCategory: string | null;
  docContent: string | null;
  /** scenario_override */
  scenarioAction: string | null;
  scenarioReply: Record<string, string> | null;
}

export interface CoachThread {
  id: number;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoachThreadDetail {
  thread: CoachThread;
  messages: CoachMessage[];
  proposals: CoachProposal[];
}

export interface CoachTurn {
  message: CoachMessage;
  proposals: CoachProposal[];
}

export const coachService = {
  // apiGetList, not apiGet — the api-client strips pagination off paginated
  // endpoints when unwrapped with apiGet.
  listThreads: () => apiGetList<CoachThread>('/ai-coach/threads', { page: 1, size: 50 }),
  createThread: (title?: string) => apiPost<CoachThread>('/ai-coach/threads', { title }),
  getThread: (id: number) => apiGet<CoachThreadDetail>(`/ai-coach/threads/${id}`),
  archiveThread: (id: number) => apiDelete<{ archived: boolean }>(`/ai-coach/threads/${id}`),
  send: (threadId: number, message: string, refMessageId?: number) =>
    apiPost<CoachTurn>(`/ai-coach/threads/${threadId}/messages`, {
      message,
      ref_message_id: refMessageId,
    }),
  apply: (
    id: number,
    override?: { persona?: string; rule?: string; doc_content?: string; scenario_reply?: string },
  ) => apiPost<CoachProposal>(`/ai-coach/proposals/${id}/apply`, override ?? {}),
  reject: (id: number) => apiPost<CoachProposal>(`/ai-coach/proposals/${id}/reject`, {}),
  revert: (id: number) => apiPost<CoachProposal>(`/ai-coach/proposals/${id}/revert`, {}),
};
