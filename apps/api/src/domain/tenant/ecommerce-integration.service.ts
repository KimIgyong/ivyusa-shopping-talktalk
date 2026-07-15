import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ECOMMERCE_PROVIDERS, EcommerceProvider, INTEGRATION_FIELDS } from '@ivy/types';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { IntegrationService } from '../integration/integration.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { decryptSecret, encryptSecret } from '../../global/util/crypto.util';
import { EcommerceIntegrationMapper } from './ecommerce-integration.mapper';
import { IntegrationSettingsResponse, IntegrationTestResponse } from './dto/response/tenant.response';
import { probeEcommerce } from './ecommerce-probe.util';

/**
 * Generic per-tenant e-commerce integration settings (cafe24 / woocommerce / odoo /
 * haravan). Credentials are stored as an AES-256-GCM encrypted JSON blob in the
 * shared `integration_credentials` table, keyed by (tenant, provider). Secrets are
 * never returned — only the non-secret fields and "configured" flags. Shopify keeps
 * its own richer flow (TenantService); this covers the four generic providers.
 */
@Injectable()
export class EcommerceIntegrationService {
  constructor(
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
    private readonly integrationService: IntegrationService,
  ) {}

  private assertProvider(provider: string): EcommerceProvider {
    if (!(ECOMMERCE_PROVIDERS as readonly string[]).includes(provider)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    return provider as EcommerceProvider;
  }

  private parseConfig(cred: IntegrationCredential | null): Record<string, string> {
    if (!cred?.secretEnc) return {};
    try {
      const parsed = JSON.parse(decryptSecret(cred.secretEnc)) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  async getSettings(tenantId: number, provider: string): Promise<IntegrationSettingsResponse> {
    const p = this.assertProvider(provider);
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: p } });
    const status = await this.integrationService.findByName(p);
    return EcommerceIntegrationMapper.toSettings(p, this.parseConfig(cred), cred ?? null, status ?? null);
  }

  /**
   * Merge the incoming config into the stored blob and re-encrypt. Only fields in
   * the provider schema are kept; empty secret fields leave the stored value intact,
   * while non-secret fields are set (or cleared) from the request.
   */
  async save(
    tenantId: number,
    provider: string,
    incoming: Record<string, string>,
  ): Promise<IntegrationSettingsResponse> {
    const p = this.assertProvider(provider);
    let cred = await this.credRepo.findOne({ where: { tenantId, provider: p } });
    const merged = this.parseConfig(cred);

    for (const spec of INTEGRATION_FIELDS[p]) {
      const raw = incoming[spec.key];
      if (raw === undefined) continue;
      const value = String(raw).trim();
      if (spec.secret) {
        if (value) merged[spec.key] = value; // empty → keep existing secret
      } else {
        merged[spec.key] = value; // non-secret: set or clear
      }
    }

    const secretEnc = encryptSecret(JSON.stringify(merged));
    if (cred) {
      cred.secretEnc = secretEnc;
      cred.status = 'connected';
    } else {
      cred = this.credRepo.create({ tenantId, provider: p, secretEnc, status: 'connected' });
    }
    await this.credRepo.save(cred);
    return this.getSettings(tenantId, p);
  }

  /** Live connectivity test; records the outcome in integration_status. */
  async test(tenantId: number, provider: string): Promise<IntegrationTestResponse> {
    const p = this.assertProvider(provider);
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: p } });
    const result = await probeEcommerce(p, this.parseConfig(cred));
    await this.integrationService.upsert(p, result.ok ? 'connected' : 'error', result.detail.slice(0, 255));
    return result;
  }
}
