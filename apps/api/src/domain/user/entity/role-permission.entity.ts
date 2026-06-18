import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** roles_permissions — rank x label capability grants (FR-056). */
@Entity('roles_permissions')
@Index('idx_rp_lookup', ['scope', 'rank', 'label', 'capability'])
export class RolePermission {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 16 })
  scope: string; // system/tenant

  @Column({ type: 'varchar', length: 16, nullable: true })
  rank: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  label: string | null;

  @Column({ type: 'varchar', length: 64 })
  capability: string;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  allow: number;
}
