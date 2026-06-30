import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Scenario button shown in the widget menu (FR-003 / FN-009). */
export interface ScenarioButton {
  id: string;
  label: string;
  action: string; // delivery_status|cancel_refund|product_help|contact_support|affiliate|my_orders|message
  enabled: boolean;
}

/**
 * tenant_ai_config — per-tenant AI behavior (FR-047 / FN-040): bot persona,
 * response rules (injected into the RAG system prompt), and the editable
 * scenario-button set rendered by the widget. One row per tenant.
 */
@Entity('tenant_ai_config')
@Unique('uk_aiconfig_tenant', ['tenantId'])
export class TenantAiConfig {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'text', nullable: true })
  persona: string | null;

  @Column({ type: 'json', nullable: true })
  rules: string[] | null;

  @Column({ name: 'scenario_buttons', type: 'json', nullable: true })
  scenarioButtons: ScenarioButton[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
