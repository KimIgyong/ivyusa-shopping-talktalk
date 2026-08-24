import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { AiEngine } from './entity/ai-engine.entity';
import { TenantAiSetting } from './entity/tenant-ai-setting.entity';
import { encryptSecret, decryptSecret } from '../../global/util/crypto.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';

/**
 * Providers a tenant may pick (PLN-260824 D6).
 *
 * Only the ones with an adapter. `custom`/`google`/`azure` exist in the column
 * and in the admin form, but nothing can call them — offering them here would
 * let an operator save an engine that silently never answers.
 */
export const TENANT_PROVIDERS = ['anthropic', 'openai'] as const;
export type TenantProvider = (typeof TENANT_PROVIDERS)[number];

/** Why a connection test failed, kept apart because the fixes differ. */
export const ENGINE_TEST_REASON = {
  OK: 'ok',
  AUTH: 'auth',
  MODEL: 'model',
  RATE_LIMIT: 'rate_limit',
  UNREACHABLE: 'unreachable',
} as const;
export type EngineTestReason = (typeof ENGINE_TEST_REASON)[keyof typeof ENGINE_TEST_REASON];

export interface EngineTestResult {
  ok: boolean;
  reason: EngineTestReason;
  detail: string | null;
  elapsedMs: number;
}

export interface TenantEngineInput {
  name: string;
  provider: string;
  model: string;
  endpoint?: string | null;
  apiKey?: string | null;
}

/**
 * A tenant's own AI engines (PLN-260824 A).
 *
 * Routing already preferred a tenant's engine over the platform's; what did not
 * exist was a way for a tenant to have one. Every query here carries
 * `tenantId` — checking ownership after loading works until the one place that
 * forgets, and that place is the whole vulnerability.
 */
@Injectable()
export class TenantAiEngineService {
  private readonly logger = new Logger(TenantAiEngineService.name);

  constructor(
    @InjectRepository(AiEngine) private readonly engineRepo: Repository<AiEngine>,
    @InjectRepository(TenantAiSetting) private readonly settingRepo: Repository<TenantAiSetting>,
    // The gateway owns the adapter registry; a second copy here would drift.
    private readonly gateway: AiGatewayService,
  ) {}

  /** The tenant's own engines, newest first. */
  async listOwn(tenantId: number): Promise<AiEngine[]> {
    return this.engineRepo.find({ where: { tenantId }, order: { id: 'DESC' } });
  }

  /** Platform engines, shown read-only beside the tenant's own. */
  async listPlatform(): Promise<AiEngine[]> {
    return this.engineRepo.find({
      where: { tenantId: IsNull(), status: 'enabled' },
      order: { id: 'DESC' },
    });
  }

  async create(tenantId: number, input: TenantEngineInput): Promise<AiEngine> {
    this.assertProvider(input.provider);
    const name = input.name.trim();
    const model = input.model.trim();
    if (!name || !model) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const key = input.apiKey?.trim() || null;
    const saved = await this.engineRepo.save(
      this.engineRepo.create({
        // Never from the request body. The admin DTO takes a tenant_id and this
        // one must not, or a tenant could plant an engine in another tenant.
        tenantId,
        provider: input.provider,
        name,
        model,
        endpoint: input.endpoint?.trim() || null,
        apiKeyEncrypted: key ? encryptSecret(key) : null,
        // A key-less engine cannot answer, and an enabled engine that cannot
        // answer falls through to the stub without saying so — the failure this
        // project has already shipped once. Park it disabled with the reason on
        // screen instead.
        status: key ? 'enabled' : 'disabled',
        isDefault: 0,
      }),
    );
    this.logger.log(`tenant ${tenantId} registered engine ${saved.id} (${input.provider})`);
    return saved;
  }

  async update(tenantId: number, id: number, input: Partial<TenantEngineInput>): Promise<AiEngine> {
    const engine = await this.findOwn(tenantId, id);
    if (input.provider !== undefined) {
      this.assertProvider(input.provider);
      engine.provider = input.provider;
    }
    if (input.name !== undefined) engine.name = input.name.trim() || engine.name;
    if (input.model !== undefined) engine.model = input.model.trim() || engine.model;
    if (input.endpoint !== undefined) engine.endpoint = input.endpoint?.trim() || null;
    // An empty key field means "leave it alone", not "delete it" — the form
    // cannot show the stored key, so a blank box is its normal state.
    if (input.apiKey) {
      engine.apiKeyEncrypted = encryptSecret(input.apiKey.trim());
      if (engine.status === 'disabled') engine.status = 'enabled';
    }
    if (!engine.apiKeyEncrypted) engine.status = 'disabled';
    return this.engineRepo.save(engine);
  }

  /**
   * One default per tenant. Clearing the others is part of setting one:
   * two defaults resolve by whichever row the database hands back first.
   */
  async setDefault(tenantId: number, id: number): Promise<AiEngine> {
    const engine = await this.findOwn(tenantId, id);
    if (engine.status !== 'enabled') {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    await this.engineRepo.update({ tenantId, id: Not(id) }, { isDefault: 0 });
    engine.isDefault = 1;
    return this.engineRepo.save(engine);
  }

  /**
   * Remove an engine no function is using.
   *
   * Deleting one in use is not an error the operator would see: the function
   * quietly falls back to the platform engine and the answers change without
   * anyone touching the AI settings screen.
   */
  async remove(tenantId: number, id: number): Promise<void> {
    const engine = await this.findOwn(tenantId, id);
    const inUse = await this.settingRepo.find({ where: { tenantId, engineId: engine.id } });
    if (inUse.length) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);
    }
    await this.engineRepo.delete({ id: engine.id, tenantId });
  }

  /** Which functions still point at this engine — what `remove` refuses over. */
  async usedBy(tenantId: number, id: number): Promise<string[]> {
    const rows = await this.settingRepo.find({ where: { tenantId, engineId: id } });
    return rows.map((r) => r.func);
  }

  /**
   * Ask the provider one small question, so a wrong key or model is found here
   * rather than in a customer's conversation half a day later.
   *
   * The reasons are kept apart because the fixes are: a 401 is a key to
   * replace, a 404 is a model name to correct, a 429 is a wait. Collapsing
   * them into "connection failed" sends people to check a server that is fine.
   */
  async test(tenantId: number, id: number): Promise<EngineTestResult> {
    const engine = await this.findOwn(tenantId, id);
    const adapter = this.gateway.adapterFor(engine.provider);
    if (!adapter) {
      return { ok: false, reason: ENGINE_TEST_REASON.UNREACHABLE, detail: 'no adapter', elapsedMs: 0 };
    }
    if (!engine.apiKeyEncrypted) {
      return { ok: false, reason: ENGINE_TEST_REASON.AUTH, detail: 'no API key', elapsedMs: 0 };
    }
    const started = Date.now();
    try {
      await adapter.complete({
        model: engine.model,
        endpoint: engine.endpoint ?? undefined,
        apiKey: decryptSecret(engine.apiKeyEncrypted),
        messages: [{ role: 'user', content: 'ping' }],
        // Smallest call that still proves the credentials and the model name.
        maxTokens: 1,
      });
      return { ok: true, reason: ENGINE_TEST_REASON.OK, detail: null, elapsedMs: Date.now() - started };
    } catch (e) {
      const detail = (e as Error).message ?? '';
      return {
        ok: false,
        reason: classifyTestFailure(detail),
        detail: detail.slice(0, 200),
        elapsedMs: Date.now() - started,
      };
    }
  }

  private assertProvider(provider: string): void {
    if (!(TENANT_PROVIDERS as readonly string[]).includes(provider)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Ownership is in the WHERE clause, not in a check after the load — a lookup
   * by id alone is one forgotten comparison away from serving another tenant's
   * engine.
   */
  private async findOwn(tenantId: number, id: number): Promise<AiEngine> {
    const engine = await this.engineRepo.findOne({ where: { id, tenantId } });
    if (!engine) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return engine;
  }
}

/** Provider messages differ; the status code in them does not. */
export function classifyTestFailure(message: string): EngineTestReason {
  const m = message.toLowerCase();
  if (/\b(401|403)\b|unauthorized|invalid[_ ]api[_ ]key|authentication/.test(m)) {
    return ENGINE_TEST_REASON.AUTH;
  }
  if (/\b404\b|not[_ ]found|unknown model|model.*does not exist/.test(m)) {
    return ENGINE_TEST_REASON.MODEL;
  }
  if (/\b429\b|rate[_ ]limit|too many requests|overloaded/.test(m)) {
    return ENGINE_TEST_REASON.RATE_LIMIT;
  }
  return ENGINE_TEST_REASON.UNREACHABLE;
}
