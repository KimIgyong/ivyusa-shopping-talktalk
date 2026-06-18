import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** restock_subscriptions — back-in-stock notification requests (FR-042). */
@Entity('restock_subscriptions')
export class RestockSubscription {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_restock_customer')
  customerId: number | null;

  @Column({ name: 'product_id', type: 'varchar', length: 64 })
  @Index('idx_restock_product')
  productId: string;

  @Column({ type: 'varchar', length: 16, default: 'in_app' })
  channel: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'notified_at', type: 'datetime', nullable: true })
  notifiedAt: Date | null;
}
