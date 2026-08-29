import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * board_comments — discussion on a board document (PLN-260829 B3 P5-1).
 * No edits, only delete (author or master/director): a comment someone
 * replied to must not quietly change meaning under the reply.
 */
@Entity('board_comments')
export class BoardComment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_board_comments_tenant')
  tenantId: number;

  @Column({ name: 'document_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_board_comments_doc')
  documentId: number;

  @Column({ type: 'text' })
  body: string;

  /** Tenant user ids the author tagged — server-cleaned, capped at 10 (P5-2). */
  @Column({ type: 'json', nullable: true })
  mentions: number[] | null;

  @Column({ name: 'author_user_id', type: 'bigint', transformer: bigintTransformer })
  authorUserId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
