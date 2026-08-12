import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * channel_outbox — one row per ShopTalk message awaiting relay to its channel.
 *
 * ShopTalk's event bus publishes at-least-once but never retries, so delivery
 * state lives here instead: attempts, backoff and the last error are rows an
 * operator can see, not log lines that scrolled past (PLN-260810 §4.1).
 */
@Entity('channel_outbox')
@Unique('uk_co_message', ['messageId'])
@Index('idx_co_due', ['status', 'nextAttemptAt'])
export class ChannelOutbox {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'thread_id', type: 'bigint', transformer: bigintTransformer })
  threadId: number;

  @Column({ name: 'message_id', type: 'bigint', transformer: bigintTransformer })
  messageId: number;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: string; // pending | sent | unconfirmed | failed

  /**
   * Provider-side command id when the send is asynchronous (btbz relay hands
   * the reply to a device agent). Kept so the worker can ask what became of it.
   */
  @Column({ name: 'external_command_id', type: 'varchar', length: 64, nullable: true })
  externalCommandId: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 255, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
