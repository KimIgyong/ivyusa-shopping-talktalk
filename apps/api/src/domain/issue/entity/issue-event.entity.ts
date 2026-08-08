import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const ISSUE_EVENT_TYPE = {
  CREATED: 'created',
  STATUS_CHANGED: 'status_changed',
  ASSIGNED: 'assigned',
  TIER_ADVANCED: 'tier_advanced',
  MEMO: 'memo',
  REOPENED: 'reopened',
} as const;
export type IssueEventType = (typeof ISSUE_EVENT_TYPE)[keyof typeof ISSUE_EVENT_TYPE];

/** issue_events — append-only timeline of an issue (PLN-260808-Issue-Workflow-P1). */
@Entity('issue_events')
@Index('idx_ievt_issue', ['issueId', 'id'])
export class IssueEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'issue_id', type: 'bigint', transformer: bigintTransformer })
  issueId: number;

  @Column({ name: 'actor_type', type: 'varchar', length: 8 })
  actorType: string; // system | ai | agent

  @Column({ name: 'actor_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  actorId: number | null;

  @Column({ type: 'varchar', length: 16 })
  type: string; // IssueEventType

  @Column({ name: 'from_status', type: 'varchar', length: 16, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 16, nullable: true })
  toStatus: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
