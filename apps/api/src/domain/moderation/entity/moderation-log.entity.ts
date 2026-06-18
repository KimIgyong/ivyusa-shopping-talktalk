import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** moderation_logs — moderation decision audit trail (FR-069). */
@Entity('moderation_logs')
export class ModerationLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_modlog_tenant')
  tenantId: number;

  @Column({ name: 'conversation_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_modlog_conv')
  conversationId: number | null;

  @Column({ name: 'author_type', type: 'varchar', length: 8 })
  authorType: string; // agent/ai

  @Column({ name: 'author_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  authorId: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  excerpt: string | null;

  @Column({ name: 'rule_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  ruleId: number | null;

  @Column({ type: 'varchar', length: 10 })
  action: string; // block/mask/warn/rephrase/pass

  @Column({ type: 'varchar', length: 16 })
  decision: string; // blocked/delivered/edited

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
