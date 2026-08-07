import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * diary_notes — free-form shopping-diary memos (PLN-260807-IvyusaApp-Revamp F3, A-7).
 * Private to the customer: NO CJM event is emitted for notes (memos are not journey
 * signals), and the rows ride the DSAR export / customer erasure / shop_redact
 * paths in PrivacyService (free-text personal data).
 */
@Entity('diary_notes')
export class DiaryNote {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_diary_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_diary_customer')
  customerId: number;

  @Column({ type: 'varchar', length: 1000 })
  body: string;

  /** Optional pin to a catalog product (validated against the tenant catalog on create). */
  @Column({ name: 'product_handle', type: 'varchar', length: 255, nullable: true })
  productHandle: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
