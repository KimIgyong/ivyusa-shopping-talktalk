import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** The operator-typed code lives in embed snippets — keep it URL/attribute safe. */
export const AI_AGENT_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * ai_agents — a tenant's AI counter staff (PLN-260820-Multi-AI-Agent-Personas).
 *
 * Each row is one persona the widget can answer with: landing-page guests,
 * internal admin staff, hotel partners, ad partners… A session is pinned to an
 * agent at creation (embed `data-agent`, messenger channel binding, preview
 * pick) and NULL means the tenant's default agent, so pages installed before
 * this feature keep today's behaviour.
 *
 * NOT the `agents` table — that one holds the human console agents
 * (conversations.agent_id points there).
 */
@Entity('ai_agents')
@Unique('uk_aiagent_code', ['tenantId', 'code'])
@Index('idx_aiagent_tenant', ['tenantId', 'isDefault'])
export class AiAgent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  /** Stable routing key used by embed snippets and channel bindings; locked after create. */
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** NULL falls back to DEFAULT_PERSONA — same semantics as tenant_ai_config. */
  @Column({ type: 'text', nullable: true })
  persona: string | null;

  @Column({ type: 'json', nullable: true })
  rules: string[] | null;

  /** Inactive agents stop matching by code; sessions already pinned fall back to default. */
  @Column({ type: 'tinyint', width: 1, default: 1 })
  active: number;

  /** Exactly one per tenant (enforced in service, transactionally). */
  @Column({ name: 'is_default', type: 'tinyint', width: 1, default: 0 })
  isDefault: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
