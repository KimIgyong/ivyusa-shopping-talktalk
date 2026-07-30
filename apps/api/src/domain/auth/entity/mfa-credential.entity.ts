import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * mfa_credentials — one TOTP credential per account (REQ-MFA / PLN-MFA Stage M1).
 * Keyed by (actor_type, actor_id) to span the dual account model (admins/users).
 * The secret is AES-256-GCM encrypted (crypto.util), stored base64.
 * `enabled_at` NULL = enrollment pending (secret issued, code not yet confirmed).
 */
@Entity('mfa_credentials')
@Unique('uk_mfa_actor', ['actorType', 'actorId'])
export class MfaCredential {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'actor_type', type: 'varchar', length: 16 })
  actorType: string; // admin/user

  @Column({ name: 'actor_id', type: 'bigint', transformer: bigintTransformer })
  actorId: number;

  /** AES-256-GCM([IV][tag][ciphertext]) of the base32 secret, base64-encoded. */
  @Column({ name: 'secret_enc', type: 'varchar', length: 512 })
  secretEnc: string;

  @Column({ name: 'enabled_at', type: 'datetime', nullable: true })
  enabledAt: Date | null;

  /** Last accepted TOTP time step — codes at or before it are replays (rejected). */
  @Column({ name: 'last_used_step', type: 'bigint', nullable: true, transformer: bigintTransformer })
  lastUsedStep: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
