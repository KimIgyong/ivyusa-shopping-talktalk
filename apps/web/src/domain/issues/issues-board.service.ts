import { apiGet, apiPatch } from '@/lib/api-client';

/** Kanban card (mirrors IssueCardResponse). */
export interface IssueCard {
  id: string;
  issueNo: number;
  conversationId: string;
  type: string;
  status: string;
  priority: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeLabel: string | null;
  reopenCount: number;
  slaState: 'ok' | 'warning' | 'overdue' | null;
  /** Session behind the issue — printed on the card so it is identifiable. */
  sessionId: string;
  /** Operator-set session name, when one exists (PLN-260812). */
  sessionAlias: string | null;
  /** The shopper's own last line — what the card is about. */
  preview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardResponse {
  columns: Record<string, IssueCard[]>;
}

export interface BoardStats {
  workflowMode: string;
  counts: Record<string, number>;
  unassigned: number;
  byLabel: Record<string, number>;
  avgResolutionHours: number | null;
  reopenRate: number | null;
}

export const issuesBoardService = {
  board: () => apiGet<BoardResponse>('/agent/issues/board'),
  stats: () => apiGet<BoardStats>('/agent/issues/stats'),
  setPriority: (id: string, priority: 'normal' | 'urgent') =>
    apiPatch(`/agent/issues/${id}/priority`, { priority }),
};
