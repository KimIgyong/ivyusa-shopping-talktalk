import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** integration_status — external integration connection state (FR-047). */
@Entity('integration_status')
@Unique('uk_integration_name', ['name'])
export class IntegrationStatusEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string; // shopify/fulfillment/klaviyo/odoo/google_drive

  @Column({ type: 'varchar', length: 16, default: 'connected' })
  status: string;

  @Column({ name: 'last_sync_at', type: 'datetime', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  detail: string | null;
}
