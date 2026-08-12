import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * What a proposal changes.
 *
 * The split matters more than the list: a factual correction ("our refund
 * window is 30 days") must land in a knowledge document, never in a response
 * rule — encoding policy numbers as instructions is a documented anti-pattern
 * (REQ §13.1). W1 could only refuse such feedback; `kb_upsert` (W3) gives it
 * somewhere correct to go.
 */
export const PROPOSAL_TYPE = {
  PERSONA_PATCH: 'persona_patch',
  RULE_ADD: 'rule_add',
  RULE_EDIT: 'rule_edit',
  RULE_REMOVE: 'rule_remove',
  /** New knowledge document, or a revision of an existing one. */
  KB_UPSERT: 'kb_upsert',
  /** Tenant edit to one scenario button's scripted reply. */
  SCENARIO_OVERRIDE: 'scenario_override',
} as const;
export type ProposalType = (typeof PROPOSAL_TYPE)[keyof typeof PROPOSAL_TYPE];

export const PROPOSAL_STATUS = {
  PENDING: 'pending',
  APPLIED: 'applied',
  REJECTED: 'rejected',
  /** A later change to the same target invalidated this one. */
  SUPERSEDED: 'superseded',
  /** Applied, then rolled back to the captured previous value. */
  REVERTED: 'reverted',
} as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS)[keyof typeof PROPOSAL_STATUS];

/**
 * The change itself. `previous` is captured at APPLY time (not at propose time)
 * so a revert restores what was actually replaced.
 *
 * Rules are addressed by their exact text, never by array index: the config can
 * move between proposing and applying, and an index would then silently rewrite
 * the wrong rule. A missing match is reported as stale (E4015).
 */
export interface ProposalPayload {
  /** persona_patch: the full replacement persona. */
  persona?: string;
  /** rule_add / rule_edit: the new rule text. */
  rule?: string;
  /** rule_edit / rule_remove: the existing rule this targets, matched exactly. */
  targetRule?: string;

  /** kb_upsert: the document to revise. Absent means "create a new one". */
  docId?: number;
  docTitle?: string;
  docCategory?: string;
  docContent?: string;

  /** scenario_override: which scenario action, and its replacement reply per language. */
  scenarioAction?: string;
  scenarioReply?: Record<string, string>;

  /** Why the agent proposed this — shown to humans, never sent back to the model. */
  rationale?: string;
  /** Existing rules the agent flagged as possibly contradicting this one. */
  conflictsWith?: string[];
  /** Value replaced at apply time, for one-step revert. */
  previous?: {
    persona?: string;
    rules?: string[];
    scenarioOverrides?: Record<string, unknown> | null;
  };
}

/** agent_coaching_proposals — a reviewable config diff produced by coaching (FR-072). */
@Entity('agent_coaching_proposals')
@Index('idx_coach_prop_thread', ['threadId', 'id'])
@Index('idx_coach_prop_tenant_status', ['tenantId', 'status'])
export class CoachingProposal {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'thread_id', type: 'bigint', transformer: bigintTransformer })
  threadId: number;

  /** The agent turn that produced it — anchors the change to its rationale. */
  @Column({ name: 'message_id', type: 'bigint', transformer: bigintTransformer })
  messageId: number;

  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'json' })
  payload: ProposalPayload;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;

  @Column({ name: 'applied_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  appliedBy: number | null;

  @Column({ name: 'applied_at', type: 'datetime', nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
