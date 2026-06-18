import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** kb_documents — knowledge base documents for RAG (FR-064). */
@Entity('kb_documents')
export class KbDocument {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_kb_tenant')
  tenantId: number | null;

  @Column({ type: 'varchar', length: 24, default: 'knowledge_store' })
  source: string; // knowledge_store/google_drive

  @Column({ name: 'source_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_kb_source')
  sourceId: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index('idx_kb_category')
  category: string | null; // faq/product/policy/warranty

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'longtext', nullable: true })
  content: string | null;

  @Column({ name: 'embedding_ref', type: 'varchar', length: 128, nullable: true })
  embeddingRef: string | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  active: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string; // embedded/pending

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
