import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Lifecycle: authored → published → (B2) promoted into KB or rejected. */
export const BOARD_DOC_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  /** Adopted into kb_documents (B2 — value reserved here so the enum is complete). */
  PROMOTED: 'promoted',
  /** Reviewed and deliberately NOT adopted (B2). */
  REJECTED: 'rejected',
} as const;
export type BoardDocStatus = (typeof BOARD_DOC_STATUS)[keyof typeof BOARD_DOC_STATUS];

/**
 * board_documents — Smart Knowledge Board entries (PLN-260829 B1).
 *
 * The curation layer ABOVE kb_documents: everything is written here first and
 * only operator-adopted documents become agent knowledge (B2). Content is
 * Markdown source (D-5): a rich-HTML body would fight both the [[wikilink]]
 * features and the embedding text quality downstream.
 */
@Index('ft_board_docs_title_content', ['title', 'content'], { fulltext: true, parser: 'ngram' })
@Entity('board_documents')
export class BoardDocument {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_board_docs_tenant')
  tenantId: number;

  @Column({ name: 'board_id', type: 'bigint', transformer: bigintTransformer })
  boardId: number;

  /** Same closed set as kb_documents.doc_group — adoption maps 1:1 (B2). */
  @Column({ name: 'doc_group', type: 'varchar', length: 16, default: 'counsel' })
  docGroup: string;

  /** Board-side two-level taxonomy (REQ C6) — independent of kb_categories. */
  @Column({ type: 'varchar', length: 64 })
  category1: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category2: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /** Authoring team — a job_labels code (consult/accounting/operations…). */
  @Column({ name: 'team_label', type: 'varchar', length: 32, nullable: true })
  teamLabel: string | null;

  /** Markdown source. */
  @Column({ type: 'longtext', nullable: true })
  content: string | null;

  @Column({ type: 'json', nullable: true })
  tags: string[] | null;

  /** [[wikilink]] targets parsed at save time; consumed by backlinks in B3. */
  @Column({ type: 'json', nullable: true })
  links: string[] | null;

  @Column({ type: 'varchar', length: 16, default: BOARD_DOC_STATUS.DRAFT })
  status: string;

  @Column({ name: 'author_user_id', type: 'bigint', transformer: bigintTransformer })
  authorUserId: number;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  updatedBy: number | null;

  /** The kb_documents row this was adopted into (B2). */
  @Column({ name: 'promoted_document_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  promotedDocumentId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
