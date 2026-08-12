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

/**
 * messenger_channels — one connected external messenger account per row
 * (PLN-260810 PR-M1). A tenant may hold several rows for the same provider
 * (e.g. two Gmail work mailboxes), which is why the natural key includes the
 * operator-chosen `label`.
 */
@Entity('messenger_channels')
@Unique('uk_mc_tenant_provider_label', ['tenantId', 'provider', 'label'])
@Unique('uk_mc_webhook_token', ['webhookToken'])
@Index('idx_mc_active', ['active', 'provider'])
export class MessengerChannel {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_mc_tenant')
  tenantId: number;

  @Column({ type: 'varchar', length: 16 })
  provider: string; // telegram | viber | amoebatalk | btbz_relay | gmail

  @Column({ type: 'varchar', length: 8, default: 'direct' })
  mode: string; // direct | hub

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ name: 'external_account_id', type: 'varchar', length: 128, nullable: true })
  externalAccountId: string | null;

  /**
   * Inbound routing key for webhook-kind channels. The receive URL carries it,
   * so a single lookup resolves both the tenant and the caller's authenticity
   * (the AMA kakao-integration pattern). NULL for poll-kind channels.
   */
  @Column({ name: 'webhook_token', type: 'varchar', length: 64, nullable: true })
  webhookToken: string | null;

  /** Non-secret provider settings (sub-channel selection, hosts, …). */
  @Column({ type: 'json', nullable: true })
  config: Record<string, unknown> | null;

  /** Provider credentials, AES-256-GCM (POL-018). Never returned to a client. */
  @Column({ name: 'secret_enc', type: 'varbinary', length: 2048, nullable: true })
  secretEnc: Buffer | null;

  /** Kept in sync with `replyMode` so a code rollback still behaves. */
  @Column({ name: 'auto_reply', type: 'tinyint', width: 1, default: 1 })
  autoReply: number;

  /**
   * How this channel answers by default: off | approve | auto (PLN-260812).
   * A session may override it; an agent on the thread outranks both.
   */
  @Column({ name: 'reply_mode', type: 'varchar', length: 8, default: 'auto' })
  replyMode: string;

  @Column({ name: 'consent_mode', type: 'varchar', length: 8, default: 'notice' })
  consentMode: string; // notice | auto

  @Column({ type: 'tinyint', width: 1, default: 0 })
  active: number;

  @Column({ type: 'varchar', length: 16, default: 'unknown' })
  status: string; // connected | error | unknown

  @Column({ name: 'last_sync_at', type: 'datetime', nullable: true })
  lastSyncAt: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 255, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
