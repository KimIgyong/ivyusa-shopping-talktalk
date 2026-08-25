import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LocalizedText, ScenarioConfigResponse } from '@ivy/types';
import { SESSION_LANGUAGE_CODES } from '@ivy/types';
import {
  HandoffConfig,
  ScenarioButton,
  ScenarioOverride,
  TenantAiConfig,
} from './entity/tenant-ai-config.entity';
import { AiAgent } from './entity/ai-agent.entity';
import { AiAgentService } from './ai-agent.service';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { AiConfigRevisionService, RecordRevisionMeta } from './ai-config-revision.service';

/** TTL for the per-tenant persona/rules cache (PERF-11) — read on every RAG turn. */
const PERSONA_CACHE_TTL_SEC = 60;

/**
 * Per (tenant, agent) since PLN-260820 — sessions pinned to different AI agents
 * must not share one cached persona. `null` (unpinned session / legacy caller)
 * resolves the tenant default.
 */
export function personaCacheKey(tenantId: number, aiAgentId?: number | null): string {
  return `aicfg:persona:${tenantId}:${aiAgentId ?? 'default'}`;
}

/** Default scenario buttons (FR-003) seeded when a tenant has no custom set. */
export const DEFAULT_SCENARIO_BUTTONS: ScenarioButton[] = [
  { id: 'delivery_status', label: 'Delivery status', action: 'delivery_status', enabled: true },
  { id: 'cancel_refund', label: 'Cancel / Refund', action: 'cancel_refund', enabled: true },
  { id: 'product_help', label: 'Product Help', action: 'product_help', enabled: true },
  { id: 'contact_support', label: 'Contact Support', action: 'contact_support', enabled: true },
  { id: 'affiliate', label: 'Affiliate', action: 'affiliate', enabled: true },
  { id: 'my_orders', label: 'My Orders', action: 'my_orders', enabled: true },
];

export const DEFAULT_PERSONA =
  'You are "Ivy", the customer-care assistant for IVY USA, a US-based online shopping mall. ' +
  "You talk like a warm, professional human agent on a shopping mall's live chat: greet naturally, " +
  'show you understood the question, then answer it clearly and completely. You are helpful, accurate, ' +
  "and honest — you only state facts found in the provided knowledge or the customer's own order data, " +
  'and you never guess or invent details. Always rewrite knowledge-base content in your own natural words; ' +
  'never paste raw document text, section numbers, or internal labels, and never reveal internal document ' +
  "names or system details. Match the customer's language and formality (in Korean always use polite 존댓말).";

/**
 * Starter response rules for a tenant that hasn't customised them yet (returned by
 * getConfig/getPersonaRules as a fallback, like DEFAULT_PERSONA). Once a tenant
 * saves its own rules — even an empty list — that choice is respected.
 */
export const DEFAULT_RULES: string[] = [
  "Answer only from the provided knowledge and the customer's own order data. If the answer isn't there, say you're not sure and offer to connect a human agent.",
  // The system decides handoffs, not the model. It used to say "I'll connect
  // you — please hold" on turns where nothing was queued, and the shopper
  // waited for someone who was never coming (REQ-260813).
  "Never promise a handoff. Do not say you are connecting the customer, and never ask them to wait for an agent — offer instead: 'I can connect you with an agent if you'd like.' The system performs the transfer and tells them when it happens.",
  'Never invent order details, prices, stock, shipping dates, or policies that are not in the provided context.',
  "Reply in the customer's language, concisely and politely.",
  'For payment, refund, cancellation, or personal-data-change requests outside the stated policy, hand off to a human instead of deciding on your own.',
  'Never ask for or repeat passwords, full card numbers, or government IDs.',
];

export interface AiConfigResponse {
  persona: string;
  rules: string[];
  scenarioButtons: ScenarioButton[];
  scenarioOverrides: Record<string, ScenarioOverride>;
  handoffConfig: HandoffConfig | null;
}

export interface AiConfigInput {
  persona?: string;
  rules?: string[];
  scenarioButtons?: ScenarioButton[];
  scenarioOverrides?: Record<string, ScenarioOverride>;
  handoffConfig?: HandoffConfig | null;
}

/** Tenant AI behavior config (FR-047 / FN-040): persona, response rules, scenario buttons. */
@Injectable()
export class AiConfigService {
  constructor(
    @InjectRepository(TenantAiConfig) private readonly configRepo: Repository<TenantAiConfig>,
    @InjectRepository(AiAgent) private readonly agentRepo: Repository<AiAgent>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly redis: RedisService,
    private readonly revisions: AiConfigRevisionService,
    private readonly agents: AiAgentService,
  ) {}

  /**
   * Admin read — returns stored config or defaults. Persona/rules come from the
   * chosen agent (default agent when omitted) since PLN-260820; scenario
   * buttons/overrides and handoff stay tenant-wide.
   */
  async getConfig(tenantId: number, aiAgentId?: number | null): Promise<AiConfigResponse> {
    const row = await this.configRepo.findOne({ where: { tenantId } });
    const { persona, rules } = await this.resolvePersonaRules(tenantId, aiAgentId ?? null, row);
    return {
      persona,
      rules,
      scenarioButtons: row?.scenarioButtons ?? DEFAULT_SCENARIO_BUTTONS,
      scenarioOverrides: row?.scenarioOverrides ?? {},
      handoffConfig: row?.handoffConfig ?? null,
    };
  }

  /** Handoff routing for a tenant, or null when it has never been configured. */
  async getHandoffConfig(tenantId: number | null): Promise<HandoffConfig | null> {
    if (tenantId == null) return null;
    const row = await this.configRepo.findOne({ where: { tenantId } });
    return row?.handoffConfig ?? null;
  }

  /**
   * One action's tenant edits, or null when it uses the built-in script.
   * Read on every scenario turn — shares the persona cache TTL policy by
   * being a single indexed row read (no extra cache layer for now).
   */
  async getScenarioOverride(
    tenantId: number | null,
    action: string,
  ): Promise<ScenarioOverride | null> {
    if (tenantId == null) return null;
    const row = await this.configRepo.findOne({ where: { tenantId } });
    return row?.scenarioOverrides?.[action] ?? null;
  }

  /**
   * Admin write — upsert persona / rules / scenario buttons.
   *
   * Every write path lands here (the settings form, an approved coaching
   * proposal, a revert), which is why history is recorded here rather than at
   * each caller: a path added later gets versioning for free instead of
   * silently skipping it.
   */
  async upsertConfig(
    tenantId: number,
    input: AiConfigInput,
    meta?: RecordRevisionMeta,
    aiAgentId?: number | null,
  ): Promise<AiConfigResponse> {
    const before = await this.getConfig(tenantId, aiAgentId);

    // Persona/rules live on the agent row since PLN-260820 (null = default
    // agent, created on first write for tenants predating the feature).
    let agent: AiAgent | null = null;
    if (input.persona !== undefined || input.rules !== undefined) {
      agent =
        aiAgentId != null
          ? await this.agentRepo.findOne({ where: { id: aiAgentId, tenantId } })
          : await this.agents.ensureDefault(tenantId);
      if (!agent) {
        throw new BusinessException(ERROR_CODE.AI_AGENT_NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      if (input.persona !== undefined) agent.persona = input.persona;
      if (input.rules !== undefined) agent.rules = input.rules;
      await this.agentRepo.save(agent);
    }

    // Scenario buttons/overrides and handoff stay tenant-wide on the legacy row.
    const row =
      (await this.configRepo.findOne({ where: { tenantId } })) ??
      this.configRepo.create({ tenantId });
    if (input.scenarioButtons !== undefined) row.scenarioButtons = this.sanitize(input.scenarioButtons);
    if (input.scenarioOverrides !== undefined) {
      row.scenarioOverrides = this.sanitizeOverrides(input.scenarioOverrides);
    }
    if (input.handoffConfig !== undefined) row.handoffConfig = input.handoffConfig;
    await this.configRepo.save(row);

    await this.redis.del(personaCacheKey(tenantId, aiAgentId ?? null));
    if (agent) {
      await this.redis.del(personaCacheKey(tenantId, Number(agent.id)));
      // A write to the default agent must also refresh unpinned sessions.
      if (agent.isDefault === 1) await this.redis.del(personaCacheKey(tenantId, null));
    }
    const after = await this.getConfig(tenantId, aiAgentId);

    // History is best-effort by design: the service swallows its own failures
    // so a bad revision write can never fail the save it is describing.
    if (meta) {
      await this.revisions.record(
        tenantId,
        { persona: after.persona, rules: after.rules, scenarioOverrides: after.scenarioOverrides },
        { persona: before.persona, rules: before.rules, scenarioOverrides: before.scenarioOverrides },
        { ...meta, aiAgentId: agent ? Number(agent.id) : (meta.aiAgentId ?? null) },
      );
    }
    return after;
  }

  /** RAG (FN-016/017) — persona + rules to inject into the system prompt. */
  async getPersonaRules(
    tenantId: number,
    aiAgentId?: number | null,
  ): Promise<{ persona: string; rules: string[] }> {
    const key = personaCacheKey(tenantId, aiAgentId ?? null);
    if (this.redis.available()) {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as { persona: string; rules: string[] };
    }
    // Runtime path: a deactivated agent stops answering — pinned sessions
    // degrade to the tenant default rather than keeping a retired persona alive.
    const result = await this.resolvePersonaRules(tenantId, aiAgentId ?? null, undefined, {
      requireActive: true,
    });
    await this.redis.set(key, JSON.stringify(result), PERSONA_CACHE_TTL_SEC);
    return result;
  }

  /**
   * Agent → default agent → legacy tenant row → built-in defaults.
   *
   * The legacy tenant_ai_config fallback matters during rollout: SQL backfill
   * runs before the code deploy, but a dev database (synchronize) or a tenant
   * created in between has no agent rows yet, and shoppers must not meet a
   * blank persona because of that.
   */
  private async resolvePersonaRules(
    tenantId: number,
    aiAgentId: number | null,
    legacyRow?: TenantAiConfig | null,
    opts: { requireActive?: boolean } = {},
  ): Promise<{ persona: string; rules: string[] }> {
    if (aiAgentId != null) {
      const where = opts.requireActive
        ? { id: aiAgentId, tenantId, active: 1 }
        : { id: aiAgentId, tenantId };
      const row = await this.agentRepo.findOne({ where });
      if (row) {
        return { persona: row.persona ?? DEFAULT_PERSONA, rules: row.rules ?? DEFAULT_RULES };
      }
    }
    const def = await this.agentRepo.findOne({ where: { tenantId, isDefault: 1 } });
    if (def) {
      return { persona: def.persona ?? DEFAULT_PERSONA, rules: def.rules ?? DEFAULT_RULES };
    }
    const legacy =
      legacyRow !== undefined ? legacyRow : await this.configRepo.findOne({ where: { tenantId } });
    return { persona: legacy?.persona ?? DEFAULT_PERSONA, rules: legacy?.rules ?? DEFAULT_RULES };
  }


  /**
   * Widget (public) — enabled scenario buttons for the session's tenant,
   * narrowed to the session's AI agent (REQ-260825 R5): a button with an
   * `agentIds` list shows only for those agents; an empty list means every
   * agent. A NULL pin resolves to the tenant's default agent for matching.
   */
  async getScenarioForSession(sessionToken: string): Promise<ScenarioConfigResponse> {
    // Belt to the controller's SessionToken guard: an empty/undefined token
    // must never reach findOne — TypeORM drops an undefined predicate and
    // returns an arbitrary session (cross-tenant config leak, FIX-260825).
    if (!sessionToken?.trim()) {
      throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    const tenantId = session.tenantId ?? (await this.firstTenantId());
    const row = tenantId ? await this.configRepo.findOne({ where: { tenantId } }) : null;
    const buttons = row?.scenarioButtons ?? DEFAULT_SCENARIO_BUTTONS;
    const scoped = buttons.filter((b) => b.enabled);
    const hasScoping = scoped.some((b) => (b.agentIds ?? []).length > 0);
    if (!hasScoping) return { scenarioButtons: scoped };
    let effectiveAgentId = session.aiAgentId != null ? Number(session.aiAgentId) : null;
    if (effectiveAgentId == null && tenantId) {
      const def = await this.agentRepo.findOne({ where: { tenantId, isDefault: 1 } });
      effectiveAgentId = def ? Number(def.id) : null;
    }
    return {
      scenarioButtons: scoped.filter((b) => {
        const ids = b.agentIds ?? [];
        if (!ids.length) return true;
        return effectiveAgentId != null && ids.map(Number).includes(effectiveAgentId);
      }),
    };
  }

  private async firstTenantId(): Promise<number | null> {
    const t = await this.tenantRepo.findOne({ where: {}, order: { id: 'ASC' } });
    return t?.id ?? null;
  }

  /**
   * Keep only meaningful edits: blank strings are dropped so the built-in
   * script shows through, and an action whose every field ended up empty is
   * removed entirely (that is how a tenant "resets to default").
   */
  private sanitizeOverrides(
    input: Record<string, ScenarioOverride>,
  ): Record<string, ScenarioOverride> | null {
    const out: Record<string, ScenarioOverride> = {};
    for (const [action, ov] of Object.entries(input ?? {})) {
      if (!ov) continue;
      const entry: ScenarioOverride = {};

      const reply = this.trimLangMap(ov.reply);
      if (reply) entry.reply = reply;

      const followUps = (ov.followUps ?? [])
        .map((f) => ({ id: f.id?.trim(), label: this.trimLangMap(f.label) }))
        .filter((f): f is { id: string; label: Record<string, string> } => !!f.id && !!f.label);
      if (followUps.length) entry.followUps = followUps;

      if (ov.postAction && ov.postAction.type && ov.postAction.type !== 'none') {
        const url = ov.postAction.url?.trim();
        // A URL action without a URL is a no-op — drop it rather than storing a trap.
        if (ov.postAction.type !== 'open_url' || url) {
          entry.postAction = { type: ov.postAction.type, ...(url ? { url } : {}) };
        }
      }

      if (Object.keys(entry).length > 0) out[action] = entry;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private trimLangMap(map: LocalizedText | undefined): LocalizedText | undefined {
    if (!map) return undefined;
    const out: LocalizedText = {};
    for (const lang of SESSION_LANGUAGE_CODES) {
      const v = map[lang]?.trim();
      if (v) out[lang] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private sanitize(buttons: ScenarioButton[]): ScenarioButton[] {
    return buttons
      .filter((b) => b && typeof b.label === 'string' && b.label.trim().length > 0)
      .map((b, i) => {
        // Agent scoping (REQ-260825 R5): numeric ids only, deduped; an empty
        // list is stored as ABSENT so unscoped buttons stay byte-identical to
        // their pre-R5 shape. (This rebuild is exactly why the field must be
        // handled here — anything not listed is silently dropped on save.)
        const agentIds = [
          ...new Set((b.agentIds ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0)),
        ];
        return {
          id: b.id?.trim() || `btn_${i}`,
          label: b.label.trim().slice(0, 60),
          action: b.action?.trim() || 'message',
          enabled: b.enabled !== false,
          ...(agentIds.length ? { agentIds } : {}),
        };
      });
  }
}
