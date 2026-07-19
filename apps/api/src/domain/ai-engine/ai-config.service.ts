import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioButton, TenantAiConfig } from './entity/tenant-ai-config.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** TTL for the per-tenant persona/rules cache (PERF-11) — read on every RAG turn. */
const PERSONA_CACHE_TTL_SEC = 60;

function personaCacheKey(tenantId: number): string {
  return `aicfg:persona:${tenantId}`;
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
  'You are IVY USA’s friendly, concise customer-support assistant. Be helpful and accurate, and only answer from the provided knowledge.';

export interface AiConfigResponse {
  persona: string;
  rules: string[];
  scenarioButtons: ScenarioButton[];
}

export interface AiConfigInput {
  persona?: string;
  rules?: string[];
  scenarioButtons?: ScenarioButton[];
}

/** Tenant AI behavior config (FR-047 / FN-040): persona, response rules, scenario buttons. */
@Injectable()
export class AiConfigService {
  constructor(
    @InjectRepository(TenantAiConfig) private readonly configRepo: Repository<TenantAiConfig>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly redis: RedisService,
  ) {}

  /** Admin read — returns stored config or defaults. */
  async getConfig(tenantId: number): Promise<AiConfigResponse> {
    const row = await this.configRepo.findOne({ where: { tenantId } });
    return {
      persona: row?.persona ?? DEFAULT_PERSONA,
      rules: row?.rules ?? [],
      scenarioButtons: row?.scenarioButtons ?? DEFAULT_SCENARIO_BUTTONS,
    };
  }

  /** Admin write — upsert persona / rules / scenario buttons. */
  async upsertConfig(tenantId: number, input: AiConfigInput): Promise<AiConfigResponse> {
    const row =
      (await this.configRepo.findOne({ where: { tenantId } })) ??
      this.configRepo.create({ tenantId });
    if (input.persona !== undefined) row.persona = input.persona;
    if (input.rules !== undefined) row.rules = input.rules;
    if (input.scenarioButtons !== undefined) row.scenarioButtons = this.sanitize(input.scenarioButtons);
    await this.configRepo.save(row);
    await this.redis.del(personaCacheKey(tenantId));
    return this.getConfig(tenantId);
  }

  /** RAG (FN-016/017) — persona + rules to inject into the system prompt. */
  async getPersonaRules(tenantId: number): Promise<{ persona: string; rules: string[] }> {
    const key = personaCacheKey(tenantId);
    if (this.redis.available()) {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as { persona: string; rules: string[] };
    }
    const row = await this.configRepo.findOne({ where: { tenantId } });
    const result = { persona: row?.persona ?? DEFAULT_PERSONA, rules: row?.rules ?? [] };
    await this.redis.set(key, JSON.stringify(result), PERSONA_CACHE_TTL_SEC);
    return result;
  }

  /** Widget (public) — enabled scenario buttons for the session's tenant. */
  async getScenarioForSession(sessionToken: string): Promise<{ scenarioButtons: ScenarioButton[] }> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    const tenantId = session.tenantId ?? (await this.firstTenantId());
    const row = tenantId ? await this.configRepo.findOne({ where: { tenantId } }) : null;
    const buttons = row?.scenarioButtons ?? DEFAULT_SCENARIO_BUTTONS;
    return { scenarioButtons: buttons.filter((b) => b.enabled) };
  }

  private async firstTenantId(): Promise<number | null> {
    const t = await this.tenantRepo.findOne({ where: {}, order: { id: 'ASC' } });
    return t?.id ?? null;
  }

  private sanitize(buttons: ScenarioButton[]): ScenarioButton[] {
    return buttons
      .filter((b) => b && typeof b.label === 'string' && b.label.trim().length > 0)
      .map((b, i) => ({
        id: b.id?.trim() || `btn_${i}`,
        label: b.label.trim().slice(0, 60),
        action: b.action?.trim() || 'message',
        enabled: b.enabled !== false,
      }));
  }
}
