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

/** Entity → console response (camelCase per convention). */
export class IssueMapper {
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
