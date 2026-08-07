import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * nudges — "please buy me this" share cards (PLN-260807-IvyusaApp-Revamp F2, A-5).
 * The code is the public share key: recipients open /app/nudge/:code with no app
 * and no session. v1 tracks views only (response/conversion tracking is P2).
 */
@Entity('nudges')
@Unique('uk_nudge_code', ['code'])
export class Nudge {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_nudge_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  customerId: number;

  @Column({ name: 'product_handle', type: 'varchar', length: 255 })
  productHandle: string;

  @Column({ type: 'varchar', length: 280, nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'int', default: 0 })
  views: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
