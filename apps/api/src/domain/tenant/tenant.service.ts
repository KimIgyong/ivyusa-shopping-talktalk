import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { IntegrationStatusEntity } from '../integration/entity/integration-status.entity';
import { IntegrationService } from '../integration/integration.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { decryptSecret, encryptSecret } from '../../global/util/crypto.util';
import { UpdateShopifySettingsRequest } from './dto/request/tenant.request';
import { ShopifyTestResponse } from './dto/response/tenant.response';

/** provider/name key used for the Shopify credential and integration status. */
const SHOPIFY = 'shopify';
const SHOPIFY_API_VERSION = '2024-10';

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
    private readonly integrationService: IntegrationService,
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

  /** Resolve a tenant by its Shopify shop domain (e.g. from a webhook header). */
  async findByShopDomain(shopDomain: string): Promise<Tenant | null> {
    return this.tenantRepo.findOne({ where: { shopDomain } });
  }

  /** Tenant ids that have a stored Shopify credential (for scheduled sync). */
  async listShopifyTenantIds(): Promise<number[]> {
    const creds = await this.credRepo.find({ where: { provider: SHOPIFY } });
    return creds.map((c) => c.tenantId).filter((id): id is number => id != null);
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

  // ---- Shopify connection settings (self-service, per tenant) ----

  /** Current tenant + Shopify credential/status for the settings view. */
  async getShopifyView(tenantId: number): Promise<{
    tenant: Tenant;
    cred: IntegrationCredential | null;
    status: IntegrationStatusEntity | null;
  }> {
    const tenant = await this.findById(tenantId);
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: SHOPIFY } });
    const status = await this.integrationService.findByName(SHOPIFY);
    return { tenant, cred: cred ?? null, status: status ?? null };
  }

  /**
   * Save the shop domain (+ optional name) and, if credential fields are given,
   * pack them into the encrypted `shopify` credential. Empty credential fields
   * leave the stored secret untouched.
   */
  async saveShopify(
    tenantId: number,
    dto: UpdateShopifySettingsRequest,
  ): Promise<{
    tenant: Tenant;
    cred: IntegrationCredential | null;
    status: IntegrationStatusEntity | null;
  }> {
    const tenant = await this.findById(tenantId);
    const shopDomain = dto.shop_domain.trim();
    if (shopDomain !== tenant.shopDomain) {
      const dup = await this.tenantRepo.findOne({ where: { shopDomain } });
      if (dup && dup.id !== tenant.id) {
        throw new BusinessException(ERROR_CODE.DUPLICATE_RESOURCE, HttpStatus.CONFLICT);
      }
      tenant.shopDomain = shopDomain;
    }
    if (dto.name !== undefined) tenant.name = dto.name.trim() || null;
    await this.tenantRepo.save(tenant);

    if (dto.access_token && dto.access_token.trim()) {
      const secret = JSON.stringify({
        accessToken: dto.access_token.trim(),
        ...(dto.api_key?.trim() ? { apiKey: dto.api_key.trim() } : {}),
        ...(dto.api_secret?.trim() ? { apiSecret: dto.api_secret.trim() } : {}),
      });
      await this.upsertCredential(tenantId, SHOPIFY, secret);
    }
    return this.getShopifyView(tenantId);
  }

  /**
   * Resolve the shop domain + decrypted Admin API token for a tenant, or null if
   * either is missing. Shared by the connectivity test and the order/customer sync.
   */
  async getShopifyConnection(
    tenantId: number,
  ): Promise<{ shopDomain: string; token: string } | null> {
    const tenant = await this.findById(tenantId);
    const shopDomain = tenant.shopDomain?.trim();
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: SHOPIFY } });
    if (!shopDomain || !cred?.secretEnc) return null;
    const token = this.extractAccessToken(decryptSecret(cred.secretEnc));
    if (!token) return null;
    return { shopDomain, token };
  }

  /**
   * Live connectivity test: pings the Shopify Admin API with the stored token and
   * records the result in integration_status. Fail-safe: any error → 'error'.
   */
  async testShopify(tenantId: number): Promise<ShopifyTestResponse> {
    const conn = await this.getShopifyConnection(tenantId);
    if (!conn) {
      return this.recordShopifyTest(false, 'Missing shop domain or Shopify credential');
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `https://${conn.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
        { headers: { 'X-Shopify-Access-Token': conn.token }, signal: controller.signal },
      );
      clearTimeout(timer);
      if (!res.ok) {
        return this.recordShopifyTest(false, `Admin API returned ${res.status}`);
      }
      const data = (await res.json()) as { shop?: { name?: string } };
      const name = data.shop?.name;
      return this.recordShopifyTest(true, name ? `Connected: ${name}` : 'Connected');
    } catch (e) {
      return this.recordShopifyTest(false, `Connection failed: ${(e as Error).message}`);
    }
  }

  private async recordShopifyTest(ok: boolean, detail: string): Promise<ShopifyTestResponse> {
    await this.integrationService.upsert(SHOPIFY, ok ? 'connected' : 'error', detail.slice(0, 255));
    return { ok, detail };
  }

  /** Read the access token from a stored credential (JSON blob or raw token). */
  private extractAccessToken(secret: string): string | null {
    try {
      const parsed = JSON.parse(secret) as { accessToken?: string };
      if (parsed && typeof parsed === 'object') return parsed.accessToken ?? null;
    } catch {
      /* not JSON — treat the whole value as the raw token */
    }
    return secret || null;
  }
}
