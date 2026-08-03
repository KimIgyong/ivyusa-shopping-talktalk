import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** Scenario button shown in the widget menu (FR-003 / FN-009). */
export interface ScenarioButton {
  id: string;
  label: string;
  action: string; // delivery_status|cancel_refund|product_help|contact_support|affiliate|my_orders|message
  enabled: boolean;
}

/** Where the widget should take the shopper after a scripted reply (FR-003). */
export interface ScenarioPostAction {
  type: 'none' | 'open_orders' | 'open_contact' | 'open_affiliate' | 'connect_agent' | 'open_url';
  /** Only for type='open_url'. */
  url?: string;
}

/**
 * Per-tenant edits to a built-in scenario script, keyed by action. Any field
 * may be omitted — the built-in script supplies the rest (see ScenarioService).
 * Text is per language (EN/ES/KO); a missing language falls back to EN.
 */
export interface ScenarioOverride {
  reply?: Partial<Record<'EN' | 'ES' | 'KO', string>>;
  followUps?: Array<{ id: string; label: Partial<Record<'EN' | 'ES' | 'KO', string>> }>;
  postAction?: ScenarioPostAction;
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

  /** Per-action edits to the built-in scripts, keyed by scenario action. */
  @Column({ name: 'scenario_overrides', type: 'json', nullable: true })
  scenarioOverrides: Record<string, ScenarioOverride> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
