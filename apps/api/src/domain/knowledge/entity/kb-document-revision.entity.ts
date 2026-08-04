import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const REVISION_KIND = {
  /** State as it stood before this feature existed — no actor can be credited. */
  BASELINE: 'baseline',
  CREATE: 'create',
  UPDATE: 'update',
  RESTORE: 'restore',
  DELETE: 'delete',
} as const;
export type RevisionKind = (typeof REVISION_KIND)[keyof typeof REVISION_KIND];

/**
 * kb_document_revisions — a snapshot per change to a knowledge document.
 *
 * Documents feed AI answers, so "who changed this, when, and what did it say
 * before" is the question that matters when an answer turns out wrong. Nothing
 * recorded it before: the knowledge service never even injected AuditService.
 *
 * No FK on `document_id` — documents are hard-deleted here (SPEC §13) and the
 * history has to outlive the document it describes.
 */
@Entity('kb_document_revisions')
@Unique('uk_kbrev', ['tenantId', 'documentId', 'revisionNo'])
@Index('idx_kbrev_doc', ['tenantId', 'documentId', 'revisionNo'])
export class KbDocumentRevision {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'document_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  documentId: number;

  /** Per document, starting at 1. */
  @Column({ name: 'revision_no', type: 'int' })
  revisionNo: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category: string | null;

  @Column({ type: 'longtext', nullable: true })
  content: string | null;

  @Column({ name: 'source_url', type: 'varchar', length: 512, nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'review_interval_days', type: 'int', nullable: true })
  reviewIntervalDays: number | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  active: number;

  /** Which fields this revision changed relative to the previous one. */
  @Column({ name: 'changed_fields', type: 'json', nullable: true })
  changedFields: string[] | null;

  @Column({ name: 'change_kind', type: 'varchar', length: 16 })
  changeKind: string;

  /** Null on a baseline row. */
  @Column({ name: 'actor_user_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  actorUserId: number | null;

  @Column({ name: 'restored_from', type: 'int', nullable: true })
  restoredFrom: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
