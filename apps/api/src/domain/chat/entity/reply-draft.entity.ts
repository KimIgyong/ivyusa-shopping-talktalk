import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/**
 * reply_drafts — an AI answer waiting for an agent to approve it (PLN-260812).
 *
 * Deliberately not a row in `messages`: everything there is delivered, by the
 * widget poll and by the channel outbox, so a draft stored as a message would
 * reach the customer before anyone read it.
 */
@Entity('reply_drafts')
@Index('idx_rd_conv_status', ['conversationId', 'status'])
export class ReplyDraft {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_rd_tenant')
  tenantId: number;

  @Column({ name: 'conversation_id', type: 'bigint', transformer: bigintTransformer })
  conversationId: number;

  /** The customer turn that prompted it; null if that message is gone. */
  @Column({ name: 'message_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  messageId: number | null;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'decimal',
    precision: 4,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  confidence: number | null;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: string; // pending | sent | discarded

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  resolvedBy: number | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
