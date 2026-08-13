import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';
import type { ScenarioOverride } from './tenant-ai-config.entity';

export const CONFIG_REVISION_KIND = {
  /** The state as it stood before this feature existed, so the first edit is undoable. */
  BASELINE: 'baseline',
  /** Saved from the settings form by hand. */
  MANUAL: 'manual',
  /** Written by approving a coaching proposal. */
  COACHING: 'coaching',
  /** A coaching proposal being rolled back. */
  REVERT: 'revert',
} as const;
export type ConfigRevisionKind =
  (typeof CONFIG_REVISION_KIND)[keyof typeof CONFIG_REVISION_KIND];

/**
 * tenant_ai_config_revisions — every version the persona and response rules
 * have had (FR-073).
 *
 * Until now this was the only tenant setting with no history: knowledge
 * documents keep revisions, but the persona was overwritten in place. Three
 * months later nobody could answer "why does it say this?" and there was
 * nothing to roll back to.
 */
@Entity('tenant_ai_config_revisions')
@Index('idx_cfgrev_tenant', ['tenantId', 'revisionNo'])
export class TenantAiConfigRevision {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  /** Per-tenant sequence: max+1, never count+1 (code convention §2). */
  @Column({ name: 'revision_no', type: 'int' })
  revisionNo: number;

  @Column({ type: 'text', nullable: true })
  persona: string | null;

  @Column({ type: 'json', nullable: true })
  rules: string[] | null;

  @Column({ name: 'scenario_overrides', type: 'json', nullable: true })
  scenarioOverrides: Record<string, ScenarioOverride> | null;

  @Column({ type: 'varchar', length: 16 })
  kind: string;

  /** Which of persona/rules/scenarioOverrides actually moved in this revision. */
  @Column({ name: 'changed_fields', type: 'json', nullable: true })
  changedFields: string[] | null;

  /**
   * Why. Typed by a human on a manual save, or carried over from the coaching
   * proposal's rationale — the question a snapshot alone cannot answer.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ name: 'proposal_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  proposalId: number | null;

  @Column({ name: 'actor_user_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  actorUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
