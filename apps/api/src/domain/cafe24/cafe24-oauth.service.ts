import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { INTEGRATION_PROVIDER } from '@ivy/types';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { TenantService } from '../tenant/tenant.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { Cafe24TokenService, Cafe24Credential } from './cafe24-token.service';
import { cafe24ApiHost, cafe24AuthHost } from './cafe24-admin.client';
import { logSafe, mallIdFromHost, tenantMall } from './cafe24-mall';

const CAFE24 = INTEGRATION_PROVIDER.CAFE24;
const STATE_TTL_SEC = 600;

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
    private readonly tokenService: Cafe24TokenService,
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
    // Same normalization the public sign-in path uses, so
    // `https://mall.cafe24.com/path` is accepted here too — the local version
    // left "https://mall" behind and rejected a form the other entry point took.
    const mall = mallIdFromHost(mallId);
    if (!mall) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    // Guard 1 — the mall must be the one this tenant's storefront runs on.
    // Without this the console took the operator's word for it, and amoebaorder
    // was connected to the `annehearts` mall: sign-in broke outright, and order
    // sync quietly filled amoebaorder's cache with another merchant's orders
    // (REQ-260819).
    const tenant = await this.tenantService.findById(tenantId);
    const own = tenantMall(tenant);
    if (own.kind === 'ambiguous') {
      // shop_domain and storefront_url name DIFFERENT malls, so neither is
      // evidence. Taking the first would hand out a "verified" answer built on
      // a tenant record that is itself wrong.
      this.logger.warn(
        `Cafe24 install refused: tenant ${tenantId} names two malls (${own.mallIds.join(', ')}) — fix the store domain first`,
      );
      throw new BusinessException(ERROR_CODE.CAFE24_MALL_TENANT_MISMATCH, HttpStatus.BAD_REQUEST);
    }
    if (own.kind === 'known' && own.mallId !== mall) {
      this.logger.warn(
        `Cafe24 install refused: tenant ${tenantId} runs on ${own.mallId}.cafe24.com but asked to connect "${logSafe(mall, 60)}"`,
      );
      throw new BusinessException(ERROR_CODE.CAFE24_MALL_TENANT_MISMATCH, HttpStatus.BAD_REQUEST);
    }
    if (own.kind === 'unknown') {
      // Custom domain: unverifiable, so it proceeds — but it is on the record.
      this.logger.warn(
        `Cafe24 install for tenant ${tenantId} connects "${logSafe(mall, 60)}" with no verifiable cafe24.com storefront`,
      );
    }

    // Guard 2 — one mall, one tenant. `findTenantIdByMallId` answers null both
    // for "nobody owns it" and "several do", so asking it here would read an
    // already double-claimed mall as free and let a third tenant join.
    const owners = await this.tokenService.findMallOwners(mall);
    const others = owners.filter((t) => t !== tenantId);
    if (others.length > 0) {
      this.logger.warn(
        `Cafe24 install refused: mall "${logSafe(mall, 60)}" already belongs to tenant(s) ${others.join(', ')}`,
      );
      throw new BusinessException(ERROR_CODE.CAFE24_MALL_ALREADY_CONNECTED, HttpStatus.CONFLICT);
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
    // Cafe24 declines by redirecting here with `error` and no `code`. Reported as
    // a bare "state invalid" this reads as OUR bug and says nothing about the
    // cause — a real `invalid_scope` refusal (a scope the app registration does
    // not carry) took a trip through the nginx access log to diagnose, because
    // the reason Cafe24 handed us was thrown away here (2026-08-08).
    if (query.error) {
      this.logger.warn(
        `Cafe24 OAuth refused: ${query.error}` +
          (query.error_description ? ` — ${decodeURIComponent(query.error_description).replace(/\+/g, ' ')}` : ''),
      );
      throw new BusinessException(ERROR_CODE.CAFE24_OAUTH_REFUSED, HttpStatus.BAD_REQUEST);
    }
    if (!code || !state) {
      this.logger.warn(`Cafe24 OAuth callback without ${!code ? 'code' : 'state'}`);
      throw new BusinessException(ERROR_CODE.CAFE24_OAUTH_STATE_INVALID, HttpStatus.BAD_REQUEST);
    }
    const raw = await this.redis.get(`cafe24:oauth:${state}`);
    if (!raw) {
      throw new BusinessException(ERROR_CODE.CAFE24_OAUTH_STATE_INVALID, HttpStatus.UNAUTHORIZED);
    }
    await this.redis.del(`cafe24:oauth:${state}`);
    const parsed = JSON.parse(raw) as OAuthState;

    // Re-check ownership here, not only at install start. Two tenants can pass
    // the start-time check concurrently — neither owns the mall yet — and both
    // would then store a credential for it. This closes most of that window;
    // the airtight version needs a persistent unique constraint on the mall id,
    // which today lives inside the encrypted blob (see FIX-260819 §7).
    const owners = await this.tokenService.findMallOwners(parsed.mallId);
    if (owners.some((t) => t !== parsed.tenantId)) {
      this.logger.warn(
        `Cafe24 install callback refused: mall "${logSafe(parsed.mallId, 60)}" was claimed by ` +
          `tenant(s) ${owners.filter((t) => t !== parsed.tenantId).join(', ')} while this install was in flight`,
      );
      throw new BusinessException(ERROR_CODE.CAFE24_MALL_ALREADY_CONNECTED, HttpStatus.CONFLICT);
    }

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
