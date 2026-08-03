import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** The lenses a question can be counted through (PLN D2). */
export const STAT_DIMENSION = {
  INTENT: 'intent',
  CATEGORY: 'category',
  DOCUMENT: 'document',
  KEYWORD: 'keyword',
  CLUSTER: 'cluster',
} as const;
export type StatDimension = (typeof STAT_DIMENSION)[keyof typeof STAT_DIMENSION];

/**
 * question_stats_daily — daily aggregate snapshots of customer questions.
 *
 * One table with a `dimension` axis rather than one per lens, so the job, the
 * read API and the screen stay single implementations. It also has to exist
 * independently of the raw messages: the retention purge hard-deletes those at
 * 365 days, and statistics computed live would lose their own history.
 */
@Entity('question_stats_daily')
@Unique('uk_qstat', ['tenantId', 'statDate', 'dimension', 'dimKey'])
@Index('idx_qstat_lookup', ['tenantId', 'dimension', 'statDate'])
export class QuestionStatDaily {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'stat_date', type: 'date' })
  statDate: string;

  @Column({ type: 'varchar', length: 16 })
  dimension: string;

  /** Stable id within the dimension: intent label, category, document id, keyword, cluster id. */
  @Column({ name: 'dim_key', type: 'varchar', length: 128 })
  dimKey: string;

  /** Human-readable label; PII-scrubbed before insert. */
  @Column({ name: 'dim_label', type: 'varchar', length: 255, nullable: true })
  dimLabel: string | null;

  @Column({ type: 'int', default: 0 })
  asked: number;

  @Column({ type: 'int', default: 0 })
  escalated: number;

  /** Questions answered without citing any knowledge document — the gap signal. */
  @Column({ name: 'no_source', type: 'int', default: 0 })
  noSource: number;

  @Column({
    name: 'avg_confidence',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  avgConfidence: number | null;
}
