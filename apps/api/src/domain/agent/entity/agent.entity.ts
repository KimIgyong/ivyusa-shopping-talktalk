import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** agents — chat agent directory (FR-066). */
@Entity('agents')
@Unique('uk_agents_email', ['email'])
export class Agent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 32, default: 'agent' })
  role: string; // admin/operator/agent

  @Column({ type: 'varchar', length: 16, default: 'offline' })
  status: string;
}
