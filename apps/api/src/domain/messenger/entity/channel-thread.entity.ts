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
 * channel_threads — an external conversation (Telegram chat, Viber 1:1, hub
 * conversation, mail thread) bound to a ShopTalk session/conversation.
 *
 * The unique key doubles as the concurrency guard: two webhook deliveries for a
 * brand-new chat race, one insert wins, the loser re-reads the winner's row.
 */
@Entity('channel_threads')
@Unique('uk_ct_channel_thread', ['channelId', 'externalThreadId'])
export class ChannelThread {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_ct_tenant')
  tenantId: number;

  @Column({ name: 'channel_id', type: 'bigint', transformer: bigintTransformer })
  channelId: number;

  @Column({ name: 'external_thread_id', type: 'varchar', length: 128 })
  externalThreadId: string;

  /** Hub-internal channel of this thread (zalo|line|kakao|sms…) — badge source. */
  @Column({ name: 'sub_channel', type: 'varchar', length: 16, nullable: true })
  subChannel: string | null;

  /** 0 = receive-only (btbz relay SMS): never attempt an outbound send. */
  @Column({ name: 'reply_enabled', type: 'tinyint', width: 1, default: 1 })
  replyEnabled: number;

  @Column({ name: 'external_user_id', type: 'varchar', length: 128, nullable: true })
  externalUserId: string | null;

  @Column({ name: 'external_user_name', type: 'varchar', length: 128, nullable: true })
  externalUserName: string | null;

  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sessionId: number | null;

  @Column({
    name: 'conversation_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  @Index('idx_ct_conversation')
  conversationId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  customerId: number | null;

  /** Last external message id ingested — poll-kind adapters resume from here. */
  @Column({ name: 'inbound_cursor', type: 'varchar', length: 64, nullable: true })
  inboundCursor: string | null;

  /**
   * Highest internal message id already queued for outbound relay. Scanning
   * forward from this cursor is how AI and agent replies reach the channel
   * without chat/agent code having to know channels exist at all.
   */
  @Column({
    name: 'outbound_cursor',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  outboundCursor: number | null;

  @Column({ name: 'last_inbound_at', type: 'datetime', nullable: true })
  lastInboundAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
