import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * agent_alerts — escalation alarms for the agent console (FR-S3,
 * PLAN-Scenario-Handoff-Alert). One row per escalation event; the console
 * polls status='new' rows for the alarm modal and acks them.
 */
@Entity('agent_alerts')
export class AgentAlert {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_alert_tenant')
  tenantId: number | null;

  @Column({ name: 'conversation_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_alert_conv')
  conversationId: number;

  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sessionId: number | null;

  @Column({ type: 'varchar', length: 32 })
  reason: string; // low_confidence/moderation_blocked/user_request

  @Column({ type: 'varchar', length: 300, nullable: true })
  preview: string | null;

  @Column({ type: 'varchar', length: 16, default: 'new' })
  @Index('idx_alert_status')
  status: string; // new/acked

  @Column({ name: 'acked_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  ackedBy: number | null;

  @Column({ name: 'acked_at', type: 'datetime', nullable: true })
  ackedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
