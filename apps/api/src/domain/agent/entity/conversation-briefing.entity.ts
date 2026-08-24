import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * conversation_briefings — operator-requested AI briefings (REQ-260824 R3).
 * One row per generation: the console shows the latest, older rows stay as
 * history. Translations of a briefing hang off its row as a lang→text map so
 * a repeated request for the same language never pays for a second model call.
 */
@Entity('conversation_briefings')
@Index('idx_brief_tenant_conv', ['tenantId', 'conversationId', 'id'])
export class ConversationBriefing {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'conversation_id', type: 'bigint', transformer: bigintTransformer })
  conversationId: number;

  /** Newest message covered by this briefing — tells the console it is stale. */
  @Column({ name: 'last_message_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  lastMessageId: number | null;

  @Column({ type: 'text' })
  body: string;

  /** lang code → translated briefing, filled lazily per request. */
  @Column({ type: 'json', nullable: true })
  translations: Record<string, string> | null;

  @Column({ name: 'requested_by', type: 'bigint', transformer: bigintTransformer })
  requestedBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
