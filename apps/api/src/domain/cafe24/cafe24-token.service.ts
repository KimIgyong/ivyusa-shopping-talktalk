import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INTEGRATION_PROVIDER } from '@ivy/types';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { encryptSecret, decryptSecret } from '../../global/util/crypto.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { cafe24ApiHost } from './cafe24-admin.client';

const CAFE24 = INTEGRATION_PROVIDER.CAFE24;
const ACCESS_TTL_MARGIN_MS = 60_000;

/** Encrypted Cafe24 credential payload (stored as JSON in integration_credentials). */
export interface Cafe24Credential {
  mallId: string;
  refreshToken: string;
  scopes?: string[];
  refreshIssuedAt?: number;
}

/**
 * Resolves a tenant's Cafe24 connection (mall + a fresh access token). Access
 * tokens live ~2h and are cached in memory only; the refresh token (14d, rotating)
 * is the persisted secret. Mirrors ShopTalk's Shopify token-refresh design, ported
 * from btbz-shop-pmm's `cafe24-token.service`.
 */
@Injectable()
export class Cafe24TokenService {
  private readonly logger = new Logger(Cafe24TokenService.name);
  private readonly accessCache = new Map<number, { token: string; expiresAt: number }>();
  private readonly refreshInFlight = new Map<number, Promise<string | null>>();

  constructor(
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
  ) {}

  static appConfig(): { clientId: string; clientSecret: string } {
    const clientId = process.env.CAFE24_CLIENT_ID ?? '';
    const clientSecret = process.env.CAFE24_CLIENT_SECRET ?? '';
    if (!clientId || !clientSecret) {
      throw new BusinessException(ERROR_CODE.CAFE24_APP_NOT_CONFIGURED, HttpStatus.NOT_IMPLEMENTED);
    }
    return { clientId, clientSecret };
  }

  parseCredential(json: string): Cafe24Credential | null {
    try {
      const p = JSON.parse(json) as Partial<Cafe24Credential>;
      if (!p.mallId || !p.refreshToken) return null;
      return { mallId: p.mallId, refreshToken: p.refreshToken, scopes: p.scopes, refreshIssuedAt: p.refreshIssuedAt };
    } catch {
      return null;
    }
  }

  /**
   * Map a Cafe24 mall id → the tenant that connected it. Used by the @Public
   * customer-auth start endpoint, where the storefront host is the only signal.
   * mall_id lives inside the AES-encrypted credential, so this scans+decrypts Cafe24
   * rows (few per deployment); returns null when no tenant owns the mall.
   */
  async findTenantIdByMallId(mallId: string): Promise<number | null> {
    const creds = await this.credRepo.find({ where: { provider: CAFE24 } });
    for (const c of creds) {
      if (!c.secretEnc) continue;
      const parsed = this.parseCredential(decryptSecret(c.secretEnc));
      if (parsed?.mallId === mallId) return c.tenantId;
    }
    return null;
  }

  /** Resolve mall + a valid access token for a tenant, or null if not connected. */
  async getConnection(tenantId: number): Promise<{ mallId: string; accessToken: string } | null> {
    const cred = await this.credRepo.findOne({ where: { tenantId, provider: CAFE24 } });
    if (!cred?.secretEnc) return null;
    const parsed = this.parseCredential(decryptSecret(cred.secretEnc));
    if (!parsed) return null;
    const cached = this.accessCache.get(tenantId);
    if (cached && cached.expiresAt - Date.now() > ACCESS_TTL_MARGIN_MS) {
      return { mallId: parsed.mallId, accessToken: cached.token };
    }
    const token = await this.refresh(tenantId, parsed, cred);
    return token ? { mallId: parsed.mallId, accessToken: token } : null;
  }

  /**
   * Rotate the access token via grant_type=refresh_token. Single-flight per tenant:
   * Cafe24 rotates the refresh token on every use, so a concurrent second refresh
   * with the old token would be rejected.
   */
  private refresh(
    tenantId: number,
    parsed: Cafe24Credential,
    cred: IntegrationCredential,
  ): Promise<string | null> {
    const existing = this.refreshInFlight.get(tenantId);
    if (existing) return existing;
    const run = (async (): Promise<string | null> => {
      try {
        const { clientId, clientSecret } = Cafe24TokenService.appConfig();
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const res = await fetch(`${cafe24ApiHost(parsed.mallId)}/api/v2/oauth/token`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: parsed.refreshToken,
          }).toString(),
        });
        if (!res.ok) {
          this.logger.warn(`cafe24 token refresh failed for tenant ${tenantId}: ${res.status}`);
          return null;
        }
        const data = (await res.json()) as {
          access_token?: string;
          expires_in?: number | string;
          refresh_token?: string;
        };
        if (!data.access_token) return null;
        // Persist the rotated refresh token (Cafe24 issues a new one each refresh).
        if (data.refresh_token && data.refresh_token !== parsed.refreshToken) {
          const next: Cafe24Credential = {
            ...parsed,
            refreshToken: data.refresh_token,
            refreshIssuedAt: Date.now(),
          };
          cred.secretEnc = encryptSecret(JSON.stringify(next));
          await this.credRepo.save(cred);
        }
        const ttlMs = (Number(data.expires_in) || 7200) * 1000;
        this.accessCache.set(tenantId, { token: data.access_token, expiresAt: Date.now() + ttlMs });
        return data.access_token;
      } catch (e) {
        this.logger.warn(`cafe24 token refresh error tenant ${tenantId}: ${(e as Error).message}`);
        return null;
      } finally {
        this.refreshInFlight.delete(tenantId);
      }
    })();
    this.refreshInFlight.set(tenantId, run);
    return run;
  }
}
