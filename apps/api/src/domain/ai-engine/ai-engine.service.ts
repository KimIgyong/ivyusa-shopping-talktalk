import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiEngine } from './entity/ai-engine.entity';
import { CreateEngineRequest, UpdateEngineRequest } from './dto/request/ai-engine.request';
import { encryptSecret } from '../../global/util/crypto.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Platform AI engine catalog management (FR-070). Admin-managed; engines may be
 * platform-wide (tenant_id null) or tenant-specific. API keys are encrypted at
 * rest (encryptSecret) and never returned in responses.
 */
@Injectable()
export class AiEngineService {
  constructor(@InjectRepository(AiEngine) private readonly engineRepo: Repository<AiEngine>) {}

  async list(): Promise<AiEngine[]> {
    return this.engineRepo.find({ order: { id: 'DESC' } });
  }

  /** Enabled engines available to tenants for function assignment. */
  async listEnabled(): Promise<AiEngine[]> {
    return this.engineRepo.find({ where: { status: 'enabled' }, order: { id: 'DESC' } });
  }

  async create(body: CreateEngineRequest): Promise<AiEngine> {
    const engine = this.engineRepo.create({
      tenantId: body.tenant_id ?? null,
      provider: body.provider,
      name: body.name,
      model: body.model,
      endpoint: body.endpoint ?? null,
      apiKeyEncrypted: body.api_key ? encryptSecret(body.api_key) : null,
      capabilities: body.capabilities ?? 'chat,rag,summary,assist,moderation',
      status: 'enabled',
      isDefault: body.is_default ?? 0,
    });
    return this.engineRepo.save(engine);
  }

  async update(id: number, body: UpdateEngineRequest): Promise<AiEngine> {
    const engine = await this.findEngine(id);
    if (body.provider !== undefined) engine.provider = body.provider;
    if (body.name !== undefined) engine.name = body.name;
    if (body.model !== undefined) engine.model = body.model;
    if (body.endpoint !== undefined) engine.endpoint = body.endpoint;
    if (body.capabilities !== undefined) engine.capabilities = body.capabilities;
    if (body.status !== undefined) engine.status = body.status;
    if (body.is_default !== undefined) engine.isDefault = body.is_default;
    if (body.api_key !== undefined) engine.apiKeyEncrypted = encryptSecret(body.api_key);
    return this.engineRepo.save(engine);
  }

  async remove(id: number): Promise<void> {
    await this.findEngine(id);
    await this.engineRepo.delete({ id });
  }

  async findEngine(id: number): Promise<AiEngine> {
    const engine = await this.engineRepo.findOne({ where: { id } });
    if (!engine) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return engine;
  }
}
