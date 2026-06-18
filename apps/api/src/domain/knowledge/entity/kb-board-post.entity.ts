import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** kb_board_posts — board-mode knowledge posts (FR-065). */
@Entity('kb_board_posts')
export class KbBoardPost {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'source_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_post_source')
  sourceId: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'longtext', nullable: true })
  body: string | null;

  @Column({ name: 'author_user_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  authorUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
