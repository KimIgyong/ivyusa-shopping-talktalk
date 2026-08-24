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
 * usage_types — the product types a tenant writes usage guides for
 * (PLN-260824 A축, REQ-260824 G1).
 *
 * These were ten constants in code, tuned to IVY USA's K-beauty catalogue.
 * Every other tenant got the same ten: an apparel shop was offered "Press-on
 * nails" and had nowhere to put laundry care. Measured before the change, the
 * hardcoded list classified 65% of IVY USA's catalogue and **0%** of the other
 * two catalogues (REQ §A-2).
 */
@Entity('usage_types')
@Unique('uk_usage_type', ['tenantId', 'key'])
export class UsageType {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  @Index('idx_usage_type_tenant')
  tenantId: number;

  /**
   * Stable slug, and the second half of the guide document's `external_key`
   * (`usage:{key}`). Generated from the label once and never changed after —
   * rewriting it would orphan the guide already written against it (REQ C3).
   *
   * Stored as `type_key`, not `key`: KEY is a MySQL reserved word, and while
   * TypeORM quotes its own identifiers, the migration and any hand-written SQL
   * would each have to remember the backticks. Renaming the column once is
   * cheaper than relying on everyone remembering (PLN said `key`).
   */
  @Column({ name: 'type_key', type: 'varchar', length: 64 })
  key: string;

  /**
   * What the operator sees. Deliberately a single string rather than one per
   * system language: asking an operator to supply six translations of their own
   * catalogue vocabulary trades a real cost for a benefit nobody asked for
   * (PLN D1).
   */
  @Column({ type: 'varchar', length: 128 })
  label: string;

  /**
   * Newline-separated match terms, tested against title + category + tags.
   * Null means the type matches nothing yet — a usable state: the guide can be
   * written before the keywords are tuned.
   */
  @Column({ type: 'text', nullable: true })
  keywords: string | null;

  /**
   * Match order, and the reason this is a list rather than a set: the first
   * match wins, so a narrow type has to be able to sit above a broad one that
   * contains it ("lash adhesive" ⊂ "lash").
   */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /**
   * Turned off rather than deleted. A tenant that stops using a seeded type
   * should not lose the guide body someone already wrote for it.
   */
  @Column({ type: 'tinyint', width: 1, default: 1 })
  active: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
