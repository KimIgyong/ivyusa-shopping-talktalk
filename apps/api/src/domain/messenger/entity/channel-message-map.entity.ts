import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * channel_message_map — external message id ↔ ShopTalk message id.
 *
 * One table, three jobs (AMA kakao-integration lesson): duplicate inbound
 * delivery is skipped, an inbound-origin message is never echoed back out, and
 * a retried send cannot deliver twice.
 */
@Entity('channel_message_map')
@Unique('uk_cmm_thread_ext', ['threadId', 'externalMessageId'])
export class ChannelMessageMap {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'thread_id', type: 'bigint', transformer: bigintTransformer })
  threadId: number;

  @Column({ name: 'external_message_id', type: 'varchar', length: 128 })
  externalMessageId: string;

  @Column({ name: 'message_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_cmm_message')
  messageId: number;

  @Column({ type: 'varchar', length: 8 })
  direction: string; // inbound | outbound

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
