import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** assignments — conversation-to-agent assignments (FR-067). */
@Entity('assignments')
export class Assignment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'conversation_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_assign_conv')
  conversationId: number;

  @Column({ name: 'agent_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_assign_agent')
  agentId: number | null;

  @Column({ name: 'assigned_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  assignedBy: number | null;

  @Column({ type: 'varchar', length: 8, default: 'auto' })
  type: string; // auto/manual

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // active/transferred/released

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @Column({ name: 'released_at', type: 'datetime', nullable: true })
  releasedAt: Date | null;
}
