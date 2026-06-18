import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** knowledge_sources — 3-mode knowledge ingestion sources (FR-064, FR-065). */
@Entity('knowledge_sources')
export class KnowledgeSource {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_ksrc_tenant')
  tenantId: number;

  @Column({ type: 'varchar', length: 16 })
  type: string; // board/repository/gdrive

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // active/inactive

  @Column({ type: 'tinyint', width: 1, default: 1 })
  designated: number;

  @Column({ name: 'config_json', type: 'json', nullable: true })
  configJson: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
