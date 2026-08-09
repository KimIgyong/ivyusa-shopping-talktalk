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
