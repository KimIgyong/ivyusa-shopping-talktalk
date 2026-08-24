import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const COMMENT_SCOPE = {
  CONVERSATION: 'conversation',
  SESSION: 'session',
} as const;
export type CommentScope = (typeof COMMENT_SCOPE)[keyof typeof COMMENT_SCOPE];

/**
 * chat_comments — internal operator notes on a conversation or a session
 * (REQ-260824 R4). Console-only: never rendered to the shopper, never joined
 * into the transcript. A conversation-scoped comment lives and dies with its
 * thread; a session-scoped one follows the shopper across every conversation
 * of that session (context handover between agents).
 */
@Entity('chat_comments')
@Index('idx_ccomment_tenant_conv', ['tenantId', 'conversationId'])
@Index('idx_ccomment_tenant_sess', ['tenantId', 'sessionId'])
export class ChatComment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 16 })
  scope: string; // conversation | session

  /** Set when scope=conversation; NULL for session-scoped notes. */
  @Column({ name: 'conversation_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  conversationId: number | null;

  /** Set when scope=session; NULL for conversation-scoped notes. */
  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sessionId: number | null;

  @Column({ name: 'author_id', type: 'bigint', transformer: bigintTransformer })
  authorId: number;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
