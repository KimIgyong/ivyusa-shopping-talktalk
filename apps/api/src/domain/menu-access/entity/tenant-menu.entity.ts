import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * tenant_menus — platform-admin override of the plan's menu preset
 * (PLN-260812-Menu-Provisioning-Access, layer ①).
 *
 * Only exceptions are stored. No row means "follow the plan", which is what
 * keeps a plan change flowing through to tenants that never needed an override,
 * and what makes the three-state console control (plan / on / off) honest.
 */
@Entity('tenant_menus')
@Unique('uk_tenant_menu', ['tenantId', 'menuCode'])
export class TenantMenu {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'menu_code', type: 'varchar', length: 32 })
  menuCode: string;

  /** 1 = provided despite the plan, 0 = withheld despite the plan. */
  @Column({ type: 'tinyint', width: 1 })
  provided: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
