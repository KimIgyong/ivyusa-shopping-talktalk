import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** tenant_ai_settings — per-tenant function→engine mapping (FR-070). */
@Entity('tenant_ai_settings')
@Unique('uk_tenant_function', ['tenantId', 'func'])
export class TenantAiSetting {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'function', type: 'varchar', length: 16 })
  func: string; // chat/rag/summary/assist/moderation

  @Column({ name: 'engine_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_tas_engine')
  engineId: number;

  @Column({ name: 'params_json', type: 'json', nullable: true })
  paramsJson: Record<string, unknown> | null;
}
