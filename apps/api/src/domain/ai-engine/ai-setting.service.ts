import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiEngine } from './entity/ai-engine.entity';
import { TenantAiSetting } from './entity/tenant-ai-setting.entity';
import { UpsertAiSettingRequest } from './ai-engine.dto';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Per-tenant AI function->engine selection (FR-070). Resolves which engine and
 * params back each AI function (chat/rag/summary/assist/moderation) for a tenant.
 */
@Injectable()
export class AiSettingService {
  constructor(
    @InjectRepository(TenantAiSetting)
    private readonly settingRepo: Repository<TenantAiSetting>,
    @InjectRepository(AiEngine) private readonly engineRepo: Repository<AiEngine>,
  ) {}

  /** Tenant settings joined with engine names. */
  async list(
    tenantId: number,
  ): Promise<{ setting: TenantAiSetting; engineName: string | null }[]> {
    const settings = await this.settingRepo.find({
      where: { tenantId },
      order: { func: 'ASC' },
    });
    if (settings.length === 0) return [];
    const engineIds = [...new Set(settings.map((s) => s.engineId))];
    const engines = await this.engineRepo.find({ where: { id: In(engineIds) } });
    const nameById = new Map(engines.map((e) => [e.id, e.name] as const));
    return settings.map((setting) => ({
      setting,
      engineName: nameById.get(setting.engineId) ?? null,
    }));
  }

  /** Upsert the engine assigned to a tenant's AI function. */
  async upsert(
    tenantId: number,
    func: string,
    body: UpsertAiSettingRequest,
  ): Promise<TenantAiSetting> {
    // Engine must exist and be usable by this tenant (platform-wide or own).
    const engine = await this.engineRepo.findOne({ where: { id: body.engine_id } });
    if (!engine || (engine.tenantId != null && engine.tenantId !== tenantId)) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const existing = await this.settingRepo.findOne({ where: { tenantId, func } });
    if (existing) {
      existing.engineId = body.engine_id;
      existing.paramsJson = body.params ?? null;
      return this.settingRepo.save(existing);
    }
    const setting = this.settingRepo.create({
      tenantId,
      func,
      engineId: body.engine_id,
      paramsJson: body.params ?? null,
    });
    return this.settingRepo.save(setting);
  }
}
