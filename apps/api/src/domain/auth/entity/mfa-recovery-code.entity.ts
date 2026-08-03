import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * mfa_recovery_codes — single-use recovery codes (10 per enrollment, format
 * `xxxxx-xxxxx`). Plaintext is shown exactly once at enrollment; only bcrypt
 * hashes are stored. `used_at` marks consumption (single-use).
 */
@Entity('mfa_recovery_codes')
export class MfaRecoveryCode {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'credential_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_mfa_code_credential')
  credentialId: number;

  @Column({ name: 'code_hash', type: 'varchar', length: 100 })
  codeHash: string;

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
