import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * tenant_role_menus — the tenant's own rank × menu matrix
 * (PLN-260812-Menu-Provisioning-Access, layer ②, defaults).
 *
 * Absent rows fall back to `DEFAULT_ROLE_MENUS` in @ivy/common, so an untouched
 * tenant behaves exactly as the console did before this table existed.
 *
 * Deliberately NOT the legacy `roles_permissions` table: that one has no
 * `tenant_id`, so per-tenant overrides — the entire point — were impossible.
 */
@Entity('tenant_role_menus')
@Unique('uk_tenant_rank_menu', ['tenantId', 'rank', 'menuCode'])
export class TenantRoleMenu {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  // `rank` is a MySQL 8 reserved word — quoted in the migration DDL.
  @Column({ type: 'varchar', length: 16 })
  rank: string;

  @Column({ name: 'menu_code', type: 'varchar', length: 32 })
  menuCode: string;

  @Column({ type: 'tinyint', width: 1 })
  allowed: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
