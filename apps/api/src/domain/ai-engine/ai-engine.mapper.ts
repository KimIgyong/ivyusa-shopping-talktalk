import { AiEngine } from './entity/ai-engine.entity';
import { TenantAiSetting } from './entity/tenant-ai-setting.entity';

/** Entity -> camelCase response mapping. NEVER exposes encrypted API keys. */
export class AiEngineMapper {
  /** Full catalog entry (admin view) — masks the key as a boolean flag. */
  static toEngine(e: AiEngine) {
    return {
      id: e.id,
      tenantId: e.tenantId ?? null,
      provider: e.provider,
      name: e.name,
      model: e.model,
      endpoint: e.endpoint ?? null,
      hasKey: e.apiKeyEncrypted != null,
      capabilities: e.capabilities,
      status: e.status,
      isDefault: e.isDefault,
      createdAt: e.createdAt,
    };
  }

  static toEngineList(engines: AiEngine[]) {
    return engines.map((e) => this.toEngine(e));
  }

  /** Compact engine descriptor used in the tenant settings chooser. */
  static toEngineOption(e: AiEngine) {
    return {
      id: e.id,
      provider: e.provider,
      name: e.name,
      model: e.model,
    };
  }

  static toEngineOptionList(engines: AiEngine[]) {
    return engines.map((e) => this.toEngineOption(e));
  }

  /** Tenant function->engine mapping, joined with the engine name. */
  static toSetting(s: TenantAiSetting, engineName: string | null) {
    return {
      function: s.func,
      engineId: s.engineId,
      engineName,
      params: s.paramsJson ?? null,
    };
  }
}
