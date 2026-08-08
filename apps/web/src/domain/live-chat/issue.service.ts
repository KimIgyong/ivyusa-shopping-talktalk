import { apiGet, apiPost } from '@/lib/api-client';

/** Console view of a conversation's issue (PLN-260808-Issue-Workflow-P1). */
export interface IssueItem {
  id: string;
  issueNo: number;
  conversationId: string;
  type: string;
  status: string; // received | in_progress | resolved | rejected | closed
  resolvedTier: string | null;
  priority: string;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  rejectReason: string | null;
  resolutionNote: string | null;
  reopenCount: number;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface IssueEventItem {
  id: string;
  actorType: string;
  actorId: string | null;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

export const issueService = {
  byConversation: (conversationId: string) =>
    apiGet<{ issue: IssueItem | null }>(`/agent/issues/by-conversation/${conversationId}`),
  transition: (issueId: string, to: string, rejectReason?: string, note?: string) =>
    apiPost<IssueItem>(`/agent/issues/${issueId}/transition`, {
      to,
      ...(rejectReason ? { reject_reason: rejectReason } : {}),
      ...(note ? { note } : {}),
    }),
  events: (issueId: string) => apiGet<{ events: IssueEventItem[] }>(`/agent/issues/${issueId}/events`),
};
