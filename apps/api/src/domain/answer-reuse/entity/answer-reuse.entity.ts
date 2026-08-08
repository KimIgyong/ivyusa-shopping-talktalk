import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** Where a reusable answer came from. */
export const REUSE_SOURCE = {
  AGENT: 'agent',
  AI: 'ai',
} as const;
export type ReuseSource = (typeof REUSE_SOURCE)[keyof typeof REUSE_SOURCE];

/**
 * answer_reuse — reusable Q&A pairs (PLN-260808 Track C). A repeat/similar
 * question is answered from here BEFORE the LLM runs. Question embeddings live
 * in Qdrant (`reuse_questions`, point id = this row's id); this table is the
 * source of truth. Text is stored PII-scrubbed only; answers are console-editable.
 */
@Entity('answer_reuse')
@Index('idx_reuse_tenant', ['tenantId', 'active'])
export class AnswerReuse {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 5 })
  lang: string;

  @Column({ name: 'question_text', type: 'varchar', length: 500 })
  questionText: string;

  @Column({ name: 'answer_text', type: 'text' })
  answerText: string;

  @Column({ type: 'varchar', length: 8 })
  source: string; // REUSE_SOURCE

  @Column({ name: 'source_message_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_reuse_src_msg')
  sourceMessageId: number | null;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true, transformer: decimalTransformer })
  confidence: number | null;

  @Column({ type: 'json', nullable: true })
  citations: unknown[] | null;

  @Column({ type: 'tinyint', default: 1 })
  active: number;

  @Column({ name: 'hit_count', type: 'int', default: 0 })
  hitCount: number;

  @Column({ name: 'last_hit_at', type: 'datetime', nullable: true })
  lastHitAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
