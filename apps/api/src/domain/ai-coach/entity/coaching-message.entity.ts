import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const COACHING_ROLE = {
  /** The admin coaching the agent. */
  USER: 'user',
  /** The coaching agent's reply. */
  AGENT: 'agent',
  /** Client-rendered notices (moderation block, errors). */
  SYSTEM: 'system',
} as const;
export type CoachingRole = (typeof COACHING_ROLE)[keyof typeof COACHING_ROLE];

/**
 * Diagnosis facts shown alongside an agent turn. Every number here is copied
 * from stored retrieval state — never from the model describing its own
 * reasoning, which is known to be unfaithful (REQ §3.5).
 */
export interface CoachingMessageMeta {
  /** KB documents retrieved while answering the coaching question. */
  citations?: Array<{ id: number; title: string; similarity: number | null }>;
  /** True when the moderation gate blocked the reply (text is then empty). */
  blocked?: boolean;
  /** The customer/preview turn under discussion, if one was attached. */
  refTurn?: {
    messageId: number;
    question: string;
    answer: string;
    confidence: number | null;
    citations: Array<{ id: number; title: string; similarity: number | null }>;
  };
}

/** agent_coaching_messages — one turn in a coaching thread (FR-071). */
@Entity('agent_coaching_messages')
@Index('idx_coach_msg_thread', ['threadId', 'id'])
export class CoachingMessage {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'thread_id', type: 'bigint', transformer: bigintTransformer })
  threadId: number;

  @Column({ type: 'varchar', length: 16 })
  role: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'json', nullable: true })
  meta: CoachingMessageMeta | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
