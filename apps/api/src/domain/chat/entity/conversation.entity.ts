import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** conversations — chat threads within a session (FR-010). */
// Agent-console queue scans filter by status (PERF-6).
@Index('idx_conv_status', ['status'])
// Queue driving query: tenant + status IN(...) ORDER BY id DESC — this composite
// makes it an index range scan with no filesort (PLN-260804).
@Index('idx_conv_tenant_status_id', ['tenantId', 'status', 'id'])
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_conv_tenant')
  tenantId: number | null;

  @Column({ name: 'session_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_conv_session')
  sessionId: number;

  @Column({ type: 'varchar', length: 32, default: 'widget' })
  channel: string;

  @Column({ type: 'varchar', length: 24, default: 'ai_active' })
  status: string; // ai_active/waiting/agent/ended

  @Column({ type: 'tinyint', width: 1, default: 0 })
  escalated: number;

  @Column({ name: 'agent_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_conv_agent')
  agentId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true })
  endedAt: Date | null;
}
