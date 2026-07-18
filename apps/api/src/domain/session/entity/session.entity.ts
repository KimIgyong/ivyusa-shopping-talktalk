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

  @Column({ type: 'varchar', length: 8, default: 'EN' })
  language: string; // EN/ES/KO

  @Column({ name: 'consent_state', type: 'varchar', length: 16, default: 'pending' })
  consentState: string; // pending/granted/declined

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
