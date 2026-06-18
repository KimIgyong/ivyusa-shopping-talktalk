import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** kb_files — uploaded knowledge files/attachments (FR-065). */
@Entity('kb_files')
export class KbFile {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'source_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_file_source')
  sourceId: number;

  @Column({ name: 'post_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  postId: number | null;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mime: string | null;

  @Column({ name: 'storage_path', type: 'varchar', length: 512 })
  storagePath: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  size: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
