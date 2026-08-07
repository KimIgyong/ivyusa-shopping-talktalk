import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** The two save lists share one mechanism (A-4): 'wish' = wishlist, 'later' = save-for-later. */
export const SAVE_LIST = {
  WISH: 'wish',
  LATER: 'later',
} as const;
export type SaveList = (typeof SAVE_LIST)[keyof typeof SAVE_LIST];

/**
 * product_saves — wishlist + save-for-later rows (PLN-260807-IvyusaApp-Revamp F2, A-4).
 * One row per (customer, product, list); re-saving updates the note (upsert).
 */
@Entity('product_saves')
@Unique('uk_save', ['customerId', 'productHandle', 'list'])
export class ProductSave {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_save_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_save_customer')
  customerId: number;

  @Column({ name: 'product_handle', type: 'varchar', length: 255 })
  productHandle: string;

  @Column({ type: 'varchar', length: 16 })
  list: string; // wish | later

  @Column({ type: 'varchar', length: 280, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
