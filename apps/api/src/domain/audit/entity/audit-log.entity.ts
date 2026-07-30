import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** audit_logs — privileged action audit trail (FR-061). */
@Entity('audit_logs')
@Index('idx_audit_actor', ['actorType', 'actorId'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_audit_tenant')
  tenantId: number | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 16 })
  actorType: string; // admin/user/system

  @Column({ name: 'actor_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  actorId: number;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  target: string | null;

  /** Client IP (first XFF hop) — null for system/scheduler writes. */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  /** Correlation id (x-request-id or generated UUID) — null outside a request. */
  @Column({ name: 'request_id', type: 'varchar', length: 36, nullable: true })
  requestId: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  result: string | null; // success/denied/error

  /** Small structured context — never raw PII (mask via pii.util first). */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
