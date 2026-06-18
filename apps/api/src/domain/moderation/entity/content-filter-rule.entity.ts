import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** content_filter_rules — moderation rules per tenant (FR-069, NFR-013). */
@Entity('content_filter_rules')
@Index('idx_cfr_tenant', ['tenantId', 'scope', 'isActive'])
export class ContentFilterRule {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 8, default: 'both' })
  scope: string; // agent/ai/both

  @Column({ type: 'varchar', length: 12 })
  type: string; // word/phrase/regex/context

  @Column({ name: 'pattern_or_prompt', type: 'text' })
  patternOrPrompt: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  lang: string | null; // en/es/ko or NULL=all

  @Column({ type: 'varchar', length: 8, default: 'high' })
  severity: string; // low/med/high

  @Column({ type: 'varchar', length: 10, default: 'block' })
  action: string; // block/mask/warn/rephrase

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
