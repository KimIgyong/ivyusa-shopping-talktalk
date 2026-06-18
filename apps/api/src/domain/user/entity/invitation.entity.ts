import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** invitations — staff invitation tokens (FR-063, POL-018). */
@Entity('invitations')
@Unique('uk_inv_token', ['token'])
@Index('idx_inv_tenant_email', ['tenantId', 'email'])
export class Invitation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 16, default: 'staff' })
  rank: string;

  @Column({ type: 'varchar', length: 128 })
  token: string;

  @Column({ name: 'temp_password_hash', type: 'varchar', length: 255 })
  tempPasswordHash: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string; // pending/accepted/expired

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
