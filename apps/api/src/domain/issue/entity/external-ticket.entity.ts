import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * external_tickets — conversation ↔ external helpdesk ticket reference for
 * bridge-mode tenants (PLN-260808-Issue-Workflow-P2, Gorgias L1). One ticket
 * per conversation per provider; re-escalations append to it (결정 12 — the
 * open/closed split arrives with the L2 webhook).
 */
@Entity('external_tickets')
@Unique('uk_ext_conv', ['conversationId', 'provider'])
@Index('idx_ext_tenant', ['tenantId'])
export class ExternalTicket {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'conversation_id', type: 'bigint', transformer: bigintTransformer })
  conversationId: number;

  @Column({ type: 'varchar', length: 16 })
  provider: string; // gorgias (P2)

  @Column({ name: 'external_id', type: 'varchar', length: 64 })
  externalId: string;

  /** Highest message id already relayed — append idempotency cursor. */
  @Column({ name: 'last_relayed_message_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  lastRelayedMessageId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
