import { Issue } from './entity/issue.entity';
import { IssueEvent } from './entity/issue-event.entity';

export interface IssueResponse {
  id: string;
  issueNo: number;
  conversationId: string;
  type: string;
  status: string;
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

export interface IssueEventResponse {
  id: string;
  actorType: string;
  actorId: string | null;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

/** Kanban card (P4): issue summary + computed SLA state for open statuses. */
export interface IssueCardResponse {
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
  /** Session behind the issue — the board shows it so a card is identifiable. */
  sessionId: string;
  /** Operator-set session name, when one exists (PLN-260812). */
  sessionAlias: string | null;
  /** The shopper's own last line — what the card is actually about. */
  preview: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Batched per-card extras the service resolves for the whole board at once. */
export interface IssueCardContext {
  sessionId: string;
  sessionAlias: string | null;
  preview: string | null;
}

/** SLA fallbacks (결정 5 — 2단계); tenant overrides arrive via handoffConfig.sla (B2). */
const SLA_DEFAULTS = { normalHours: 24, urgentHours: 4 };

/** Entity → console response (camelCase per convention). */
export class IssueMapper {
  static toCard(
    i: Issue,
    assigneeName: string | null,
    sla: { normalHours: number; urgentHours: number } = SLA_DEFAULTS,
    context?: IssueCardContext,
  ): IssueCardResponse {
    const open = i.status === 'received' || i.status === 'in_progress';
    let slaState: IssueCardResponse['slaState'] = null;
    if (open) {
      const limitH = i.priority === 'urgent' ? sla.urgentHours : sla.normalHours;
      const elapsedH = (Date.now() - new Date(i.createdAt).getTime()) / 3_600_000;
      slaState = elapsedH > limitH ? 'overdue' : elapsedH > limitH * 0.7 ? 'warning' : 'ok';
    }
    return {
      id: String(i.id),
      issueNo: i.issueNo,
      conversationId: String(i.conversationId),
      type: i.type,
      status: i.status,
      priority: i.priority,
      assigneeUserId: i.assigneeUserId != null ? String(i.assigneeUserId) : null,
      assigneeName,
      assigneeLabel: i.assigneeLabel,
      reopenCount: i.reopenCount,
      slaState,
      sessionId: context?.sessionId ?? String(i.sessionId),
      sessionAlias: context?.sessionAlias ?? null,
      preview: context?.preview ?? null,
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : '',
      updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : '',
    };
  }
  static toIssue(i: Issue): IssueResponse {
    return {
      id: String(i.id),
      issueNo: i.issueNo,
      conversationId: String(i.conversationId),
      type: i.type,
      status: i.status,
      resolvedTier: i.resolvedTier,
      priority: i.priority,
      assigneeUserId: i.assigneeUserId != null ? String(i.assigneeUserId) : null,
      assigneeLabel: i.assigneeLabel,
      rejectReason: i.rejectReason,
      resolutionNote: i.resolutionNote,
      reopenCount: i.reopenCount,
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : '',
      resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString() : null,
      closedAt: i.closedAt ? new Date(i.closedAt).toISOString() : null,
    };
  }

  static toEvent(e: IssueEvent): IssueEventResponse {
    return {
      id: String(e.id),
      actorType: e.actorType,
      actorId: e.actorId != null ? String(e.actorId) : null,
      type: e.type,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
    };
  }
}
