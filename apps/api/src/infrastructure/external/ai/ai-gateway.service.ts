import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFunction } from '@ivy/types';
import { AiEngine } from '../../../domain/ai-engine/entity/ai-engine.entity';
import { TenantAiSetting } from '../../../domain/ai-engine/entity/tenant-ai-setting.entity';
import { decryptSecret } from '../../../global/util/crypto.util';
import { AiAdapter, AiCompletionResult, AiMessage } from './ai-adapter.interface';
import { StubAdapter } from './adapters/stub.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';

export interface GatewayRequest {
  tenantId: number;
  function: AiFunction;
  system?: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI Provider Gateway (FR-070 / FN-053). Resolves the engine for a
 * (tenant, function) pair via tenant_ai_settings → ai_engines, dispatches to the
 * matching provider adapter, and normalizes the result. Degrades to the stub
 * adapter when the resolved provider is unavailable, so flows never hard-fail.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly adapters: Map<string, AiAdapter>;

  constructor(
    @InjectRepository(AiEngine) private readonly engineRepo: Repository<AiEngine>,
    @InjectRepository(TenantAiSetting) private readonly settingRepo: Repository<TenantAiSetting>,
    stub: StubAdapter,
    anthropic: AnthropicAdapter,
  ) {
    this.adapters = new Map<string, AiAdapter>([
      [stub.provider, stub],
      [anthropic.provider, anthropic],
    ]);
  }

  async complete(req: GatewayRequest): Promise<AiCompletionResult> {
    const engine = await this.resolveEngine(req.tenantId, req.function);
    const params = (await this.resolveParams(req.tenantId, req.function)) ?? {};
    const adapter = this.adapters.get(engine?.provider ?? 'stub') ?? this.adapters.get('stub')!;

    const apiKey = engine?.apiKeyEncrypted ? this.safeDecrypt(engine.apiKeyEncrypted) : undefined;
    try {
      return await adapter.complete({
        system: req.system,
        messages: req.messages,
        temperature: req.temperature ?? (params.temperature as number) ?? 0.3,
        maxTokens: req.maxTokens ?? (params.max_tokens as number) ?? 1024,
        model: engine?.model ?? 'stub-1',
        apiKey,
        endpoint: engine?.endpoint ?? undefined,
      });
    } catch (e) {
      this.logger.warn(`Adapter ${adapter.provider} failed, falling back to stub: ${(e as Error).message}`);
      return this.adapters.get('stub')!.complete({
        system: req.system,
        messages: req.messages,
        model: 'stub-1',
      });
    }
  }

  private async resolveEngine(tenantId: number, fn: AiFunction): Promise<AiEngine | null> {
    const setting = await this.settingRepo.findOne({ where: { tenantId, func: fn } });
    if (setting) {
      const e = await this.engineRepo.findOne({ where: { id: setting.engineId } });
      if (e && e.status === 'enabled') return e;
    }
    // fall back to a tenant default, then platform default
    return (
      (await this.engineRepo.findOne({ where: { tenantId, isDefault: 1, status: 'enabled' } })) ??
      (await this.engineRepo.findOne({ where: { isDefault: 1, status: 'enabled' } }))
    );
  }

  private async resolveParams(tenantId: number, fn: AiFunction): Promise<Record<string, unknown> | null> {
    const setting = await this.settingRepo.findOne({ where: { tenantId, func: fn } });
    return setting?.paramsJson ?? null;
  }

  private safeDecrypt(buf: Buffer): string | undefined {
    try {
      return decryptSecret(buf);
    } catch {
      return undefined;
    }
  }
}
