import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const PROPOSAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS)[keyof typeof PROPOSAL_STATUS];

/**
 * An answer a chat handler wants to become knowledge (PLN-260810 S4).
 *
 * The people who answer customers are the ones who find the gaps, but writing
 * to the knowledge base is a knowledge owner's call (D3). This table is the
 * space between: a proposal is inert until someone with that authority acts on
 * it, and the decision — including a rejection and its reason — is kept.
 */
@Entity('kb_answer_proposals')
@Index('idx_kbprop_queue', ['tenantId', 'status', 'createdAt'])
export class KbAnswerProposal {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  /** Null once the conversation is purged; the proposal outlives it. */
  @Column({ name: 'conversation_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  conversationId: number | null;

  @Column({ type: 'varchar', length: 500 })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ type: 'varchar', length: 16, default: PROPOSAL_STATUS.PENDING })
  status: string;

  @Column({ name: 'proposed_by', type: 'bigint', transformer: bigintTransformer })
  proposedBy: number;

  @Column({ name: 'decided_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  decidedBy: number | null;

  @Column({ name: 'decided_at', type: 'datetime', nullable: true })
  decidedAt: Date | null;

  /** Shown to the proposer — an unexplained refusal comes back as the same proposal. */
  @Column({ name: 'reject_reason', type: 'varchar', length: 500, nullable: true })
  rejectReason: string | null;

  /**
   * The document approval created. Deliberately not a foreign key: documents
   * are hard-deleted here (SPEC §13), and losing the proposal with the document
   * would erase who approved it.
   */
  @Column({ name: 'document_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  documentId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
