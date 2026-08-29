import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const BOARD_REVISION_KIND = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
} as const;
export type BoardRevisionKind = (typeof BOARD_REVISION_KIND)[keyof typeof BOARD_REVISION_KIND];

/** Full-body snapshots per edit — same shape kb_document_revisions proved out. */
@Entity('board_document_revisions')
@Unique('uk_board_rev', ['documentId', 'revisionNo'])
export class BoardDocumentRevision {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_board_rev_tenant')
  tenantId: number;

  @Column({ name: 'document_id', type: 'bigint', transformer: bigintTransformer })
  documentId: number;

  @Column({ name: 'revision_no', type: 'int' })
  revisionNo: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'longtext', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category1: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category2: string | null;

  @Column({ name: 'changed_fields', type: 'json', nullable: true })
  changedFields: string[] | null;

  @Column({ name: 'change_kind', type: 'varchar', length: 16, default: BOARD_REVISION_KIND.UPDATE })
  changeKind: string;

  @Column({ name: 'actor_user_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  actorUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
