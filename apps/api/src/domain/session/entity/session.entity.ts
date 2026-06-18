import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** sessions — widget visitor sessions (FR-001). */
@Entity('sessions')
@Unique('uk_sessions_token', ['sessionToken'])
export class Session {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'session_token', type: 'varchar', length: 128 })
  sessionToken: string;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_sessions_customer')
  customerId: number | null;

  @Column({ type: 'varchar', length: 8, default: 'EN' })
  language: string; // EN/ES/KO

  @Column({ name: 'consent_state', type: 'varchar', length: 16, default: 'pending' })
  consentState: string; // pending/granted/declined

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
