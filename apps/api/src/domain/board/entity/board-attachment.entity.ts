import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

export const BOARD_ATTACHMENT_KIND = {
  FILE: 'file',
  /** External reference (Google Drive etc.) — no bytes stored (B1-2). */
  LINK: 'link',
} as const;

/**
 * board_attachments — files AND external links on one table (PLN-260829 B1-2):
 * both render in the same panel and die with the same document, so two tables
 * would just split one list. Files are addressed by uuid through a signed URL
 * (the editor's <img> preview cannot carry an Authorization header).
 */
@Entity('board_attachments')
@Unique('uk_board_att_uuid', ['uuid'])
export class BoardAttachment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'document_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_board_att_doc')
  documentId: number;

  @Column({ type: 'varchar', length: 8, default: BOARD_ATTACHMENT_KIND.FILE })
  kind: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mime: string | null;

  @Column({ name: 'storage_path', type: 'varchar', length: 512, nullable: true })
  storagePath: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  size: number | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  url: string | null;

  @Column({ name: 'created_by', type: 'bigint', transformer: bigintTransformer })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
