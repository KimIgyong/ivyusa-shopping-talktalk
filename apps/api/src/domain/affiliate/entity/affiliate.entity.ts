import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** affiliates — customer affiliate program enrollment (FR-041). */
@Entity('affiliates')
@Unique('uk_aff_link', ['linkCode'])
export class Affiliate {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_aff_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_aff_customer')
  customerId: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string; // pending/approved/rejected

  @Column({ name: 'link_code', type: 'varchar', length: 64, nullable: true })
  linkCode: string | null;

  @Column({ name: 'commission_rate', type: 'decimal', precision: 5, scale: 2, default: 10.0, transformer: decimalTransformer })
  commissionRate: number;

  @CreateDateColumn({ name: 'applied_at' })
  appliedAt: Date;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt: Date | null;
}
