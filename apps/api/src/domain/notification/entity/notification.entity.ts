import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** notifications — customer/session notifications (FR-030). */
// Unread-count/list per customer (PERF-6).
@Index('idx_notif_customer_read', ['customerId', 'readAt'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_notif_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_notif_customer')
  customerId: number | null;

  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sessionId: number | null;

  @Column({ type: 'varchar', length: 16 })
  @Index('idx_notif_category')
  category: string; // payment/shipping/event/review/all

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'status_badge', type: 'varchar', length: 24, nullable: true })
  statusBadge: string | null;

  /** Deep-link target (campaign product/url — PLN-260807 F4, A-9). Client routes on tap. */
  @Column({ name: 'link_url', type: 'varchar', length: 1024, nullable: true })
  linkUrl: string | null;

  @Column({ type: 'varchar', length: 16, default: 'in_app' })
  channel: string;

  @Column({ name: 'read_at', type: 'datetime', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
