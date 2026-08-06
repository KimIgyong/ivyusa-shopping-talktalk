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
/**
 * Handoff routing (PLN-AiSetting W3). All fields optional — an empty config
 * keeps the historical behaviour: alert every agent, any time of day.
 */
export interface HandoffConfig {
  /** Agents to page. Empty/omitted = broadcast to all (first to accept wins). */
  assigneeUserIds?: number[];
  /** When agents are on duty. Omitted = always route to agents. */
  businessHours?: {
    timezone: string; // IANA, e.g. America/New_York
    days: number[]; // 0=Sun … 6=Sat
    start: string; // 'HH:mm'
    end: string; // 'HH:mm'
    /**
     * Windows inside the shift when nobody is at the console (lunch, standup).
     * Treated exactly like off hours, so the shopper is told about the email
     * reply instead of waiting for someone who is away.
     */
    breaks?: Array<{ start: string; end: string }>;
  };
  /** Where to send the conversation outside business hours. */
  offHours?: {
    email?: string;
    /** Customer-facing notice; blank falls back to the built-in wording. */
    notice?: Partial<Record<'EN' | 'ES' | 'KO', string>>;
  };
}

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

  /** Who gets paged on escalation, when, and what happens after hours. */
  @Column({ name: 'handoff_config', type: 'json', nullable: true })
  handoffConfig: HandoffConfig | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
