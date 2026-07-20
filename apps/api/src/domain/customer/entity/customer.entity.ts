import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';
import { blindIndex, decryptPii, encryptPii } from '../../../global/util/crypto.util';

/**
 * Transparent PII-at-rest transformer (PRV-M6): the property is the plaintext
 * string; the column stores AES-256-GCM ciphertext bytes. Reads decrypt (and
 * tolerate legacy plaintext), writes encrypt.
 */
const piiTransformer = {
  to: (value: string | null): Buffer | null => encryptPii(value),
  from: (value: Buffer | null): string | null => decryptPii(value),
};

/** customers — Shopify customer cache + tenancy/tier columns (FR-057). PII encrypted at rest. */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  @Index('idx_customers_tenant')
  tenantId: number | null;

  @Column({ name: 'shopify_customer_id', type: 'varchar', length: 64, nullable: true })
  shopifyCustomerId: string | null;

  // Email is encrypted (unsearchable ciphertext), so equality lookups go through
  // the deterministic email_hash blind index instead (PRV-M6).
  @Column({ type: 'varbinary', length: 512, nullable: true, transformer: piiTransformer })
  email: string | null;

  @Column({ name: 'email_hash', type: 'varchar', length: 64, nullable: true })
  @Index('idx_customers_email_hash')
  emailHash: string | null;

  @Column({ type: 'varbinary', length: 512, nullable: true, transformer: piiTransformer })
  name: string | null;

  @Column({ type: 'varbinary', length: 256, nullable: true, transformer: piiTransformer })
  phone: string | null;

  @Column({ type: 'varchar', length: 16, default: 'guest' })
  tier: string; // guest/subscriber/regular

  @Column({ name: 'shopify_tier', type: 'varchar', length: 32, nullable: true })
  shopifyTier: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Keep email_hash in lockstep with email on every write (PRV-M6). */
  @BeforeInsert()
  @BeforeUpdate()
  syncEmailHash(): void {
    this.emailHash = blindIndex(this.email);
  }
}
