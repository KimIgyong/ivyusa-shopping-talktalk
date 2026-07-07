import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** customers — Shopify customer cache + tenancy/tier columns (FR-057). */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_customers_tenant')
  tenantId: number | null;

  @Column({ name: 'shopify_customer_id', type: 'varchar', length: 64, nullable: true })
  shopifyCustomerId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index('idx_customers_email')
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 16, default: 'guest' })
  tier: string; // guest/subscriber/regular

  @Column({ name: 'shopify_tier', type: 'varchar', length: 32, nullable: true })
  shopifyTier: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
