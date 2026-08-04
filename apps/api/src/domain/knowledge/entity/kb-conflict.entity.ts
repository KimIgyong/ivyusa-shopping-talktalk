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
  /** The model never produced a usable verdict — kept out of the review queue. */
  FAILED: 'failed',
} as const;

/** Why a judgement could not be stored. A moderation block is NOT one of these:
 * the verdict survives and only the rationale is withheld (PLN E9). */
export const CONFLICT_FAILURE = {
  MODEL_ERROR: 'model_error',
  PARSE_FAIL: 'parse_fail',
  BAD_VERDICT: 'bad_verdict',
} as const;
export type ConflictFailure = (typeof CONFLICT_FAILURE)[keyof typeof CONFLICT_FAILURE];

/** Attempts after which the scan stops retrying a pair on its own (PLN E5). */
export const MAX_JUDGE_ATTEMPTS = 3;

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

  /** Set only when `status = failed`; null for judged pairs. */
  @Column({ name: 'failure_reason', type: 'varchar', length: 24, nullable: true })
  failureReason: string | null;

  /** Judgement attempts so far. The scan gives up at MAX_JUDGE_ATTEMPTS. */
  @Column({ type: 'int', default: 1 })
  attempts: number;

  /**
   * The verdict stands but the moderation gate suppressed its explanation.
   * Losing the whole "these two contradict" signal over one sentence was the
   * defect this replaces — the verdict is a three-value enum and cannot itself
   * violate a content rule.
   */
  @Column({ name: 'rationale_withheld', type: 'tinyint', width: 1, default: 0 })
  rationaleWithheld: number;

  @Column({ name: 'last_attempt_at', type: 'datetime', nullable: true })
  lastAttemptAt: Date | null;

  @CreateDateColumn({ name: 'detected_at' })
  detectedAt: Date;
}
