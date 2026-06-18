import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** order_items — line items of a cached order (FR-020). */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  @Index('idx_items_order')
  orderId: number;

  @Column({ name: 'product_id', type: 'varchar', length: 64, nullable: true })
  productId: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'option_text', type: 'varchar', length: 255, nullable: true })
  optionText: string | null;

  @Column({ type: 'int', default: 1 })
  qty: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  price: number | null;
}
