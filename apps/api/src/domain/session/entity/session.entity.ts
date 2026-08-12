import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** sessions — widget visitor sessions (FR-001). */
@Entity('sessions')
@Unique('uk_sessions_token', ['sessionToken'])
export class Session {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'session_token', type: 'varchar', length: 128 })
  sessionToken: string;

  /**
   * Origin channel. NULL = normal widget session; 'preview' = admin console
   * sandbox (/ai-setting) — isolated from agent alerts/queues and consent gate.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  channel: string | null;

  // Tenant the session belongs to (resolved at creation). Threads tenant context
  // through the chat/notification path instead of a "first tenant" lookup.
  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_sessions_tenant')
  tenantId: number | null;

  @Column({ name: 'customer_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_sessions_customer')
  customerId: number | null;

  // Identity assurance for the bound customer. 'verified' is minted only by the
  // Shopify App Proxy (Shopify-signed customer identity); 'guest' covers the
  // order-number+email lookup. DSAR export/erasure require 'verified' (SEC-C3) —
  // weak guest identity must not unlock full-account access or deletion.
  @Column({ name: 'identity_level', type: 'varchar', length: 16, default: 'guest' })
  identityLevel: string; // guest | verified

  /**
   * Operator-set display name for this session (PLN-260812). Wins over the
   * derived name (customer → email → "Session {id}") in the console; blank
   * clears it. Never shown to the shopper. It can hold a real person's name, so
   * it is handled as PII: never logged, never put in audit metadata.
   */
  @Column({ type: 'varchar', length: 60, nullable: true })
  alias: string | null;

  /**
   * Whether the AI answers this session: 'inherit' follows the channel default
   * from Settings, 'on'/'off' are the operator overriding it here (PLN-260812).
   * An agent holding the thread outranks all three.
   */
  @Column({ name: 'auto_reply_mode', type: 'varchar', length: 8, default: 'inherit' })
  autoReplyMode: string;

  @Column({ type: 'varchar', length: 8, default: 'EN' })
  language: string; // EN/ES/KO

  /**
   * The shopper picked this language themselves (language selector), so
   * auto-detection leaves it alone (PLN-260813 D3). Default 0 means every
   * existing session stays open to detection — none of them were hand-picked.
   */
  @Column({ name: 'language_locked', type: 'tinyint', width: 1, default: 0 })
  languageLocked: number;

  @Column({ name: 'consent_state', type: 'varchar', length: 16, default: 'pending' })
  consentState: string; // pending/granted/declined

  /** When the consent choice was recorded — auditable proof (PRV-M4). */
  @Column({ name: 'consent_at', type: 'datetime', nullable: true })
  consentAt: Date | null;

  /** Version of the consent notice the choice was made against (PRV-M4). */
  @Column({ name: 'consent_version', type: 'varchar', length: 32, nullable: true })
  consentVersion: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
