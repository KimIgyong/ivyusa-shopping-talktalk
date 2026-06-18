import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** agent_profiles — per-user agent capabilities & status (FR-066). */
@Entity('agent_profiles')
@Unique('uk_agent_user', ['userId'])
export class AgentProfile {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_agent_tenant')
  tenantId: number;

  @Column({ name: 'user_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  userId: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  languages: string | null; // e.g. "en,es,ko"

  @Column({ type: 'varchar', length: 255, nullable: true })
  skills: string | null; // comma tags

  @Column({ name: 'max_concurrent', type: 'int', default: 3 })
  maxConcurrent: number;

  @Column({ type: 'varchar', length: 16, default: 'offline' })
  status: string; // online/away/offline
}
