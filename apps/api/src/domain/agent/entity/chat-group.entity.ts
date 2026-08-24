import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const GROUP_KIND = {
  TIMELINE: 'timeline',
  PROJECT: 'project',
} as const;
export type GroupKind = (typeof GROUP_KIND)[keyof typeof GROUP_KIND];

/**
 * chat_groups — operator-curated grouping of sessions (REQ-260824 Session
 * Grouping, modeled on AmoebaTalk's Bound Chat). `kind` is a CLASSIFIER only:
 * timeline (one individual's sessions) vs project (a client company's
 * stakeholders) — the two must never diverge in behavior, mirroring
 * AmoebaTalk where getProject() literally delegates to getTimeline().
 *
 * A group is a view. It owns nothing: dissolving it deletes only this row and
 * its memberships, never a session, conversation, or message.
 */
@Entity('chat_groups')
@Index('idx_cgroup_tenant', ['tenantId', 'id'])
export class ChatGroup {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 16 })
  kind: string; // timeline | project

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ name: 'created_by', type: 'bigint', transformer: bigintTransformer })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
