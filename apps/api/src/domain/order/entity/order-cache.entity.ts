import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** orders_cache — multi-channel order cache (Shopify/Cafe24/Odoo…) (FR-020). */
// Dashboard/list range scans per tenant (PERF-6).
@Index('idx_ordc_tenant_created', ['tenantId', 'createdAt'])
@Entity('orders_cache')
// Channel-scoped unique so the same external order id can exist under different
// (tenant, provider) pairs — Cafe24 order "20260807-001" ≠ a Shopify order (PLN-260807).
@Unique('uk_orders_channel', ['tenantId', 'provider', 'shopifyOrderId'])
export class OrderCache {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_ordc_tenant')
  tenantId: number | null;

  /** Commerce platform this order came from — INTEGRATION_PROVIDER value. */
  @Column({ type: 'varchar', length: 16, default: 'shopify' })
  provider: string;

  // The channel's order id (column name kept for back-compat; holds the Cafe24
  // order_id for provider='cafe24', the Shopify order id for provider='shopify').
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
