import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * tenant_user_menus — per-team-member exception to the rank matrix
 * (PLN-260812-Menu-Provisioning-Access, layer ②, exceptions).
 *
 * An `allowed` row is also the escape hatch from job-label gating: when a
 * master explicitly opens a screen for one person, they mean it, so the
 * exception outranks both the matrix and the label rule. It can never outrank
 * platform provisioning.
 */
@Entity('tenant_user_menus')
@Unique('uk_tenant_user_menu', ['tenantId', 'userId', 'menuCode'])
export class TenantUserMenu {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_tum_user')
  userId: number;

  @Column({ name: 'menu_code', type: 'varchar', length: 32 })
  menuCode: string;

  @Column({ type: 'tinyint', width: 1 })
  allowed: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
