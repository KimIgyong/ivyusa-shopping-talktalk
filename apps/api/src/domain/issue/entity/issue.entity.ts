import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Issue lifecycle (REQ-260807 §5.2; decisions §10b). */
export const ISSUE_STATUS = {
  RECEIVED: 'received',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
} as const;
export type IssueStatus = (typeof ISSUE_STATUS)[keyof typeof ISSUE_STATUS];

/** Which tier settled it (직교 축): scenario(1차) / ai(2차) / agent(3차). */
export const ISSUE_TIER = { SCENARIO: 'scenario', AI: 'ai', AGENT: 'agent' } as const;
export type IssueTier = (typeof ISSUE_TIER)[keyof typeof ISSUE_TIER];

/** Rejection reason codes (결정 3): customer copy is templated per code. */
export const ISSUE_REJECT_REASON = {
  POLICY_IMPOSSIBLE: 'policy_impossible',
  MISROUTED: 'misrouted',
  SPAM: 'spam',
} as const;
export type IssueRejectReason = (typeof ISSUE_REJECT_REASON)[keyof typeof ISSUE_REJECT_REASON];

export const ISSUE_TYPES = [
  'order_status',
  'delivery',
  'cancel',
  'refund',
  'partnership',
  'other',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/**
 * issues — the ticket a conversation is promoted to (PLN-260808-Issue-Workflow-P1).
 * 1:1 with conversation (결정 1); created only on escalation (결정 2) and only for
 * `workflow_mode='native'` tenants (§11.1 entitlement, server-judged).
 */
@Entity('issues')
@Unique('uk_issue_no', ['tenantId', 'issueNo'])
@Unique('uk_issue_conv', ['conversationId'])
@Index('idx_issue_tenant_status', ['tenantId', 'status'])
export class Issue {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  /** Per-tenant human number (#37) — max+1, never count+1 (convention). */
  @Column({ name: 'issue_no', type: 'int' })
  issueNo: number;

  @Column({ name: 'conversation_id', type: 'bigint', transformer: bigintTransformer })
  conversationId: number;

  @Column({ name: 'session_id', type: 'bigint', transformer: bigintTransformer })
  sessionId: number;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  customerId: number | null;

  @Column({ type: 'varchar', length: 24, default: 'other' })
  type: string; // IssueType

  @Column({ type: 'varchar', length: 16, default: ISSUE_STATUS.RECEIVED })
  status: string; // IssueStatus

  @Column({ name: 'resolved_tier', type: 'varchar', length: 12, nullable: true })
  resolvedTier: string | null; // IssueTier

  @Column({ type: 'varchar', length: 8, default: 'normal' })
  priority: string; // normal | urgent (결정 5)

  @Column({ name: 'assignee_user_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  assigneeUserId: number | null;

  @Column({ name: 'assignee_label', type: 'varchar', length: 24, nullable: true })
  assigneeLabel: string | null; // 결정 4: consult/accounting/operations

  @Column({ name: 'reject_reason', type: 'varchar', length: 24, nullable: true })
  rejectReason: string | null; // IssueRejectReason

  @Column({ name: 'resolution_note', type: 'varchar', length: 500, nullable: true })
  resolutionNote: string | null;

  @Column({ name: 'reopen_count', type: 'int', default: 0 })
  reopenCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;
}
