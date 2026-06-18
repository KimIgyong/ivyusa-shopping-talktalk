import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { encryptSecret } from '../../global/util/crypto.util';

/**
 * Tenant lifecycle + per-tenant integration credentials (FR-051/FR-060).
 * Secrets are stored AES-256-GCM encrypted and never returned to clients.
 */
@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
  ) {}

  async list(
    page: number,
    size: number,
    status?: string,
  ): Promise<{ items: Tenant[]; total: number }> {
    const where: FindOptionsWhere<Tenant> = {};
    if (status) where.status = status;
    const [items, total] = await this.tenantRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total };
  }

  async findById(id: number): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return tenant;
  }

  async create(shopDomain: string, name: string, plan: string): Promise<Tenant> {
    const existing = await this.tenantRepo.findOne({ where: { shopDomain } });
    if (existing) {
      throw new BusinessException(ERROR_CODE.DUPLICATE_RESOURCE, HttpStatus.CONFLICT);
    }
    const tenant = this.tenantRepo.create({
      shopDomain,
      name,
      plan,
      status: 'applied',
    });
    return this.tenantRepo.save(tenant);
  }

  async updateStatus(id: number, status: string): Promise<Tenant> {
    const tenant = await this.findById(id);
    tenant.status = status;
    return this.tenantRepo.save(tenant);
  }

  async listCredentials(tenantId: number): Promise<IntegrationCredential[]> {
    return this.credRepo.find({ where: { tenantId }, order: { provider: 'ASC' } });
  }

  async upsertCredential(
    tenantId: number,
    provider: string,
    secret: string,
  ): Promise<IntegrationCredential> {
    const secretEnc = encryptSecret(secret);
    let cred = await this.credRepo.findOne({ where: { tenantId, provider } });
    if (cred) {
      cred.secretEnc = secretEnc;
      cred.status = 'connected';
    } else {
      cred = this.credRepo.create({ tenantId, provider, secretEnc, status: 'connected' });
    }
    return this.credRepo.save(cred);
  }
}
