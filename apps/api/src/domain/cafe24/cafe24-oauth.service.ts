import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { INTEGRATION_PROVIDER } from '@ivy/types';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { TenantService } from '../tenant/tenant.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { Cafe24TokenService, Cafe24Credential } from './cafe24-token.service';
import { cafe24ApiHost, cafe24AuthHost } from './cafe24-admin.client';

const CAFE24 = INTEGRATION_PROVIDER.CAFE24;
const STATE_TTL_SEC = 600;
const MALL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/;

interface OAuthState {
  tenantId: number;
  mallId: string;
}

/**
 * Cafe24 OAuth (Authorization Code). The install is initiated from the
 * authenticated console (so the tenant binding is server-trusted, carried in the
 * Redis state — not the URL); the callback is public. One shared PMM-style public
 * app: client_id/secret in env, per-tenant input is the mall_id. Ported from
 * btbz-shop-pmm's cafe24-oauth flow, using ShopTalk's Redis-state + credential store.
 */
@Injectable()
export class Cafe24OAuthService {
  private readonly logger = new Logger(Cafe24OAuthService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly tenantService: TenantService,
  ) {}

  private redirectUri(): string {
    return (
      process.env.CAFE24_REDIRECT_URI ??
      'https://shoptalk.amoeba.site/api/v1/auth/cafe24/callback'
    );
  }
  /**
   * `mall.read_category` sits beside the product scope because a product row
   * carries category NUMBERS, not names. Without it `/categories` answers 403
   * `insufficient_scope` and every product's knowledge document ends up with a
   * blank category (measured on amoebaorder, 2026-08-08).
   *
   * Adding a scope here only changes what NEW consents ask for — an already
   * connected mall keeps the scopes its refresh token was issued with until the
   * operator re-authorizes.
   */
  private scopes(): string {
    return process.env.CAFE24_SCOPES ?? 'mall.read_order,mall.read_product,mall.read_category';
  }
  get consoleReturnUrl(): string {
    return (process.env.CAFE24_CONSOLE_RETURN_URL ?? 'https://shoptalk.amoeba.site/').replace(
      /\/+$/,
      '',
    );
  }

  /** Build the authorize URL + persist the state (called by the authed console). */
  async createInstall(tenantId: number, mallId: string): Promise<{ authorizeUrl: string }> {
    Cafe24TokenService.appConfig(); // throws E5010 if the app isn't configured
    const mall = mallId.trim().replace(/\.cafe24(api)?\.com.*$/i, '');
    if (!MALL_ID_RE.test(mall)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const state = randomBytes(16).toString('hex');
    await this.redis.set(
      `cafe24:oauth:${state}`,
      JSON.stringify({ tenantId, mallId: mall } satisfies OAuthState),
      STATE_TTL_SEC,
    );
    const { clientId } = Cafe24TokenService.appConfig();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      state,
      redirect_uri: this.redirectUri(),
      scope: this.scopes(),
    });
    return { authorizeUrl: `${cafe24AuthHost(mall)}/api/v2/oauth/authorize?${params.toString()}` };
  }

  /** Verify state, exchange the code, and store the tenant's Cafe24 credential. */
  async handleCallback(query: Record<string, string>): Promise<{ mallId: string; tenantId: number }> {
    const code = query.code ?? '';
    const state = query.state ?? '';
    if (!code || !state) {
      throw new BusinessException(ERROR_CODE.CAFE24_OAUTH_STATE_INVALID, HttpStatus.BAD_REQUEST);
    }
    const raw = await this.redis.get(`cafe24:oauth:${state}`);
    if (!raw) {
      throw new BusinessException(ERROR_CODE.CAFE24_OAUTH_STATE_INVALID, HttpStatus.UNAUTHORIZED);
    }
    await this.redis.del(`cafe24:oauth:${state}`);
    const parsed = JSON.parse(raw) as OAuthState;

    const grant = await this.exchangeCode(parsed.mallId, code);
    const credential: Cafe24Credential = {
      mallId: parsed.mallId,
      refreshToken: grant.refreshToken,
      scopes: grant.scopes,
      refreshIssuedAt: Date.now(),
    };
    await this.tenantService.upsertCredential(parsed.tenantId, CAFE24, JSON.stringify(credential));
    this.logger.log(`Cafe24 OAuth connected mall=${parsed.mallId} tenant=${parsed.tenantId}`);
    return { mallId: parsed.mallId, tenantId: parsed.tenantId };
  }

  private async exchangeCode(
    mallId: string,
    code: string,
  ): Promise<{ refreshToken: string; scopes?: string[] }> {
    const { clientId, clientSecret } = Cafe24TokenService.appConfig();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${cafe24ApiHost(mallId)}/api/v2/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
    });
    if (!res.ok) {
      throw new BusinessException(ERROR_CODE.CAFE24_TOKEN_EXCHANGE_FAILED, HttpStatus.BAD_GATEWAY);
    }
    const data = (await res.json()) as { refresh_token?: string; scopes?: string[] };
    if (!data.refresh_token) {
      throw new BusinessException(ERROR_CODE.CAFE24_TOKEN_EXCHANGE_FAILED, HttpStatus.BAD_GATEWAY);
    }
    return { refreshToken: data.refresh_token, scopes: data.scopes };
  }
}
