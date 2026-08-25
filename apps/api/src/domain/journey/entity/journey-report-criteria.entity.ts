import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * journey_report_criteria — the rules a report is written by (PLN-260825 D2).
 *
 * Kept as tenant data, not code: what is worth asking differs by trade, and the
 * point of the feature is that these improve over time.
 *
 * Versioned, and the current one is simply the highest version. An `active`
 * flag alongside the version would be a second source of truth, and when two
 * disagree there is no way to tell which one wrote a past report.
 */
@Entity('journey_report_criteria')
@Unique('uk_jrc', ['tenantId', 'version'])
export class JourneyReportCriteria {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'int' })
  version: number;

  /** Per-section instructions, keyed by section id (summary, contact, …). */
  @Column({ name: 'sections_json', type: 'json' })
  sectionsJson: Record<string, string>;

  @Column({ name: 'top_questions_n', type: 'int', default: 5 })
  topQuestionsN: number;

  /**
   * How many representative utterances reach the model.
   *
   * A cap, not a preference: a group with thousands of messages would
   * otherwise turn one report into a very large call, and the aggregates
   * already carry what the counting questions need.
   */
  @Column({ name: 'sample_cap', type: 'int', default: 200 })
  sampleCap: number;

  @Column({ name: 'quote_max_chars', type: 'int', default: 200 })
  quoteMaxChars: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  tone: string | null;

  /**
   * Phrases the report must not use. Seeded with the pseudo-quantitative ones
   * ("관계 점수 78점") because a number nobody can derive reads as evidence.
   */
  @Column({ name: 'banned_json', type: 'json', nullable: true })
  bannedJson: string[] | null;

  @Column({ name: 'created_by', type: 'bigint', transformer: bigintTransformer })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
