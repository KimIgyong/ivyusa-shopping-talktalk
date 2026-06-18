import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** notification_prefs — per-customer channel/category opt-in (FR-031). */
@Entity('notification_prefs')
@Unique('uk_pref', ['customerId', 'channel', 'category'])
export class NotificationPref {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'customer_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  customerId: number;

  @Column({ type: 'varchar', length: 16 })
  channel: string; // in_app/email/sms/web_push

  @Column({ type: 'varchar', length: 16 })
  category: string; // payment/shipping/event/review

  @Column({ type: 'tinyint', width: 1, default: 1 })
  enabled: number;
}
