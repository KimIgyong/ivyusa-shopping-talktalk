import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** admin_users — system admins, cross-tenant (FR-053). */
@Entity('admin_users')
@Unique('uk_admin_email', ['email'])
export class AdminUser {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 16, default: 'admin' })
  level: string; // super_admin/admin

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;

  @Column({ name: 'must_change_password', type: 'tinyint', width: 1, default: 1 })
  mustChangePassword: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
