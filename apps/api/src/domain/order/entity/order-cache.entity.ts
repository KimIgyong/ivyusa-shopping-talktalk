import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** orders_cache — Shopify/Odoo order cache (FR-020). */
@Entity('orders_cache')
@Unique('uk_orders_shopify', ['shopifyOrderId'])
export class OrderCache {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_ordc_tenant')
  tenantId: number | null;

  @Column({ name: 'shopify_order_id', type: 'varchar', length: 64 })
  shopifyOrderId: string;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_orders_customer')
  customerId: number | null;

  @Column({ name: 'order_number', type: 'varchar', length: 32 })
  @Index('idx_orders_number')
  orderNumber: string;

  @Column({ name: 'status_internal', type: 'varchar', length: 24, nullable: true })
  statusInternal: string | null; // paid/preparing/shipping/delivered

  @Column({ name: 'status_ui', type: 'varchar', length: 24, nullable: true })
  statusUi: string | null; // Confirmed/In Transit/Delivered/Review

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  total: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true, default: 'USD' })
  currency: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
