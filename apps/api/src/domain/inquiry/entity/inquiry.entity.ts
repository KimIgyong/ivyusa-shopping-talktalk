import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** inquiries — customer support inquiries (FR-044). */
@Entity('inquiries')
export class Inquiry {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_inq_tenant')
  tenantId: number | null;

  @Column({ name: 'conversation_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  conversationId: number | null;

  @Column({ name: 'order_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_inq_order')
  orderId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_inq_customer')
  customerId: number | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: string; // open/answered

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
