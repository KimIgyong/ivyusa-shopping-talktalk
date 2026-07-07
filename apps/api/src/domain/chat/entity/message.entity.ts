import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** messages — individual chat messages (FR-011). */
@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_msg_tenant')
  tenantId: number | null;

  @Column({ name: 'conversation_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_msg_conv')
  conversationId: number;

  @Column({ name: 'sender_type', type: 'varchar', length: 16 })
  senderType: string; // user/ai/agent/system

  // For agent messages, the user id of the sending agent (FR-066). Enables
  // attributing each message to the specific logged-in agent.
  @Column({ name: 'sender_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  senderId: number | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  lang: string | null;

  @Column({ name: 'retrieval_trace', type: 'json', nullable: true })
  retrievalTrace: unknown | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
