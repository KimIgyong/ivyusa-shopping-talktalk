import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Where the erasure request came from. */
export const ERASURE_SOURCE = {
  /** The shopper used the widget's own "delete my data" (DSAR). */
  DSAR: 'dsar',
  /** Shopify's mandatory customers/redact compliance webhook. */
  SHOPIFY: 'shopify',
  /** Shopify's shop/redact — the whole store was purged. */
  SHOP_REDACT: 'shop_redact',
} as const;
export type ErasureSource = (typeof ERASURE_SOURCE)[keyof typeof ERASURE_SOURCE];

/**
 * erased_identities — a suppression list: identities that asked to be erased and
 * must never be re-created (PRV-H2).
 *
 * Anonymizing the customer row is not enough on its own. Shopify remains the
 * source of truth and keeps the shopper's email and name, so the next order sync
 * happily creates a fresh customer row from the same address and re-links their
 * orders — the erasure gets undone by a background job minutes later. Worse,
 * anonymization deliberately nulls `shopify_customer_id`, destroying the one key
 * that could have recognised them. This table is that memory, kept deliberately.
 *
 * Nothing here is reversible: both columns hold the HMAC blind index, never the
 * address or the id itself, so the list can answer "was this identity erased?"
 * without storing what it is. Retaining the pair is what makes honouring the
 * request possible — the narrowest thing that still enforces it.
 */
@Entity('erased_identities')
@Index('idx_erased_tenant_email', ['tenantId', 'emailHash'])
@Index('idx_erased_tenant_shopify', ['tenantId', 'shopifyCustomerHash'])
export class ErasedIdentity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  tenantId: number | null;

  /** blindIndex(email) — matches customers.email_hash, so lookups are a direct compare. */
  @Column({ name: 'email_hash', type: 'varchar', length: 64, nullable: true })
  emailHash: string | null;

  /** blindIndex(shopify_customer_id) — the proxy hands us the raw id and we hash to compare. */
  @Column({ name: 'shopify_customer_hash', type: 'varchar', length: 64, nullable: true })
  shopifyCustomerHash: string | null;

  @Column({ type: 'varchar', length: 16 })
  source: string;

  @CreateDateColumn({ name: 'erased_at' })
  erasedAt: Date;
}
