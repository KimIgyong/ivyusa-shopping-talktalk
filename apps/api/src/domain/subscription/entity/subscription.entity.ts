import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** subscriptions — recurring subscription orders (FR-043). */
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_sub_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_sub_customer')
  customerId: number;

  @Column({ name: 'shopify_subscription_id', type: 'varchar', length: 64, nullable: true })
  shopifySubscriptionId: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  plan: string | null;

  @Column({ name: 'next_billing', type: 'datetime', nullable: true })
  nextBilling: Date | null;
}
