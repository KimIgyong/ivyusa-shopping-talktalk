import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const COACHING_THREAD_STATUS = {
  OPEN: 'open',
  ARCHIVED: 'archived',
} as const;
export type CoachingThreadStatus = (typeof COACHING_THREAD_STATUS)[keyof typeof COACHING_THREAD_STATUS];

/**
 * agent_coaching_threads — one admin↔agent coaching conversation (FR-071).
 *
 * Deliberately NOT a `conversations` row: coaching has no customer session, and
 * folding it into the customer chat tables would put internal ops dialogue into
 * the agent console, analytics and the DSAR/erasure scans that walk `messages`.
 */
@Entity('agent_coaching_threads')
@Index('idx_coach_thread_tenant', ['tenantId', 'updatedAt'])
export class CoachingThread {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  /**
   * Which AI agent this thread is coaching (PLN-260820). NULL = the default
   * agent — including every thread from before agents became plural. Proposals
   * apply to THIS agent's persona/rules, so the dimension lives on the thread,
   * not per proposal.
   */
  @Column({ name: 'ai_agent_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  aiAgentId: number | null;

  /** Author. Threads are readable by any AI_SETTINGS_MANAGE holder in the tenant. */
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  /** Derived from the first message when the client does not supply one. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 16, default: COACHING_THREAD_STATUS.OPEN })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
