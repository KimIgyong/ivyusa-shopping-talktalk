import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * chat_group_members — one SESSION in one chat group (REQ-260824 D1).
 * Session-level membership on purpose: sessions fork a new conversation after
 * every end, so grouping conversations (AmoebaTalk's way) silently loses the
 * customer's next thread. A member session brings its past AND future
 * conversations into the group view. The same session may sit in several
 * groups; within one group it is unique.
 */
@Entity('chat_group_members')
@Unique('uq_cgm_group_session', ['groupId', 'sessionId'])
@Index('idx_cgm_tenant_session', ['tenantId', 'sessionId'])
export class ChatGroupMember {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'group_id', type: 'bigint', transformer: bigintTransformer })
  groupId: number;

  @Column({ name: 'session_id', type: 'bigint', transformer: bigintTransformer })
  sessionId: number;

  @Column({ name: 'added_by', type: 'bigint', transformer: bigintTransformer })
  addedBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
