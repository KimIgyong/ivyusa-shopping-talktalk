import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** reviews — product reviews per order item (FR-040). */
@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_rev_tenant')
  tenantId: number | null;

  @Column({ name: 'order_item_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_review_item')
  orderItemId: number;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_review_customer')
  customerId: number;

  @Column({ type: 'tinyint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 16, default: 'submitted' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
