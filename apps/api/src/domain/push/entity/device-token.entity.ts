import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** device_tokens — mobile push registrations (REQ-MobileApp, FR-030 extension). */
@Entity('device_tokens')
@Unique('uk_device_token', ['token'])
@Index('idx_dtok_tenant_customer', ['tenantId', 'customerId'])
export class DeviceToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_dtok_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_dtok_customer')
  customerId: number | null;

  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sessionId: number | null;

  @Column({ type: 'varchar', length: 16 })
  platform: string; // ios | android

  @Column({ type: 'varchar', length: 16, default: 'expo' })
  provider: string; // expo (FCM/APNs direct = future providers)

  /** Provider push token, e.g. ExponentPushToken[...]. */
  @Column({ type: 'varchar', length: 255 })
  token: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  locale: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 32, nullable: true })
  appVersion: string | null;

  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true })
  lastSeenAt: Date | null;

  /** Set when the provider reports DeviceNotRegistered or the app unregisters. */
  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
