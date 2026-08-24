import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Who pays for the call — the axis that must not be summed away (PLN-260824 D3). */
export const ENGINE_OWNER = {
  /** The tenant's own engine and key: billed to the tenant's provider account. */
  TENANT: 'tenant',
  /** A platform engine: billed to whoever runs this service. */
  PLATFORM: 'platform',
} as const;
export type EngineOwner = (typeof ENGINE_OWNER)[keyof typeof ENGINE_OWNER];

/**
 * ai_usage_daily — token usage, rolled up per day (PLN-260824 A).
 *
 * Nothing recorded token counts before this. The adapters returned
 * `tokensIn`/`tokensOut` on every call and the numbers were dropped on the
 * floor, so there was nothing to report and no way to report it backwards:
 * usage exists only from the day the meter starts.
 *
 * A daily roll-up rather than a row per call. Weekly, monthly and arbitrary
 * ranges are all sums of these rows, while a per-call log grows with
 * conversation volume forever and answers no question the roll-up cannot.
 */
@Entity('ai_usage_daily')
@Unique('uk_ai_usage', ['tenantId', 'statDate', 'feature', 'aiFunction', 'engineId', 'engineOwner'])
@Index('idx_ai_usage_lookup', ['tenantId', 'statDate'])
export class AiUsageDaily {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'stat_date', type: 'date' })
  statDate: string;

  /**
   * What spent it, finer than the AI function.
   *
   * `summary` alone covers both the knowledge-conflict review and the agent
   * briefing, so a per-function total cannot answer "which screen is costing
   * us". Callers pass a label; when they do not, the function name is used so
   * the row is still attributable.
   */
  @Column({ type: 'varchar', length: 32 })
  feature: string;

  @Column({ name: 'ai_function', type: 'varchar', length: 16 })
  aiFunction: string;

  /**
   * Nullable, and kept nullable on purpose: deleting an engine must not erase
   * the record of what it already spent.
   */
  @Column({ name: 'engine_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  engineId: number | null;

  @Column({ type: 'varchar', length: 24 })
  provider: string;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Column({ name: 'engine_owner', type: 'varchar', length: 10 })
  engineOwner: string;

  @Column({ type: 'int', default: 0 })
  calls: number;

  @Column({ name: 'tokens_in', type: 'bigint', default: 0, transformer: bigintTransformer })
  tokensIn: number;

  @Column({ name: 'tokens_out', type: 'bigint', default: 0, transformer: bigintTransformer })
  tokensOut: number;

  /**
   * Calls that fell through to the stub. Counted apart because the stub spends
   * no tokens: folded into the totals it reads as cheap traffic rather than as
   * an engine that is not answering.
   */
  @Column({ name: 'stub_calls', type: 'int', default: 0 })
  stubCalls: number;

  @Column({ type: 'int', default: 0 })
  failures: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
