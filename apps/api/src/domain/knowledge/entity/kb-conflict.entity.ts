import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

export const CONFLICT_VERDICT = {
  CONFLICT: 'conflict',
  DUPLICATE: 'duplicate',
  COMPLEMENTARY: 'complementary',
} as const;
export type ConflictVerdict = (typeof CONFLICT_VERDICT)[keyof typeof CONFLICT_VERDICT];

export const CONFLICT_STATUS = {
  PENDING: 'pending',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const;

export const CONFLICT_RESOLUTION = {
  KEPT_A: 'kept_a',
  KEPT_B: 'kept_b',
  KEPT_BOTH: 'kept_both',
} as const;

/**
 * kb_conflicts — a reviewed pair of knowledge documents that say similar things.
 *
 * Retrieval de-duplicates by document id only, so two documents that contradict
 * each other are fed into the same answer with nothing marking the disagreement.
 * A pair is stored once with the lower id first, so the same two documents
 * cannot be queued twice in mirror order.
 */
@Entity('kb_conflicts')
@Unique('uk_kbconflict_pair', ['tenantId', 'docAId', 'docBId'])
@Index('idx_kbconflict_status', ['tenantId', 'status'])
export class KbConflict {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'doc_a_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  docAId: number;

  @Column({ name: 'doc_b_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  docBId: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  similarity: number | null;

  /** conflict | duplicate | complementary — the model's reading of the pair. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  verdict: string | null;

  /** Why the model judged it that way. Passes moderation before it is stored. */
  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;

  /** What the reviewer decided: kept_a | kept_b | kept_both. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  resolution: string | null;

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  resolvedBy: number | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'detected_at' })
  detectedAt: Date;
}
