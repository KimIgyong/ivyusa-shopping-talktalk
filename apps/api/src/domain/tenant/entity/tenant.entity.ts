import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** tenants — a tenant = a Shopify shop (FR-051). */
@Entity('tenants')
@Unique('uk_tenant_shop', ['shopDomain'])
export class Tenant {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'shop_domain', type: 'varchar', length: 255 })
  shopDomain: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // applied/active/suspended

  @Column({ type: 'varchar', length: 32, nullable: true })
  plan: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
