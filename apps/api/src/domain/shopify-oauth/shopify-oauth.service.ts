import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { TenantService } from '../tenant/tenant.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { verifyShopifyQueryHmac } from '../../global/util/shopify-hmac.util';

const SHOPIFY = 'shopify';
const STATE_TTL_SEC = 600;
const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

interface OAuthConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
}

/**
 * Shopify public-app OAuth (path B). Install → authorize redirect with a nonce;
 * callback verifies the query HMAC + nonce, exchanges the code for a token, and
 * upserts the tenant + encrypted credential. Requires SHOPIFY_API_KEY/SECRET/APP_URL.
 */
@Injectable()
export class ShopifyOAuthService {
  private readonly logger = new Logger(ShopifyOAuthService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly tenantService: TenantService,
  ) {}

  private config(): OAuthConfig {
    const c: OAuthConfig = {
      apiKey: process.env.SHOPIFY_API_KEY ?? '',
      apiSecret: process.env.SHOPIFY_API_SECRET ?? '',
      scopes: process.env.SHOPIFY_SCOPES ?? 'read_orders,read_customers',
      appUrl: (process.env.SHOPIFY_APP_URL ?? '').replace(/\/+$/, ''),
    };
    if (!c.apiKey || !c.apiSecret || !c.appUrl) {
      throw new BusinessException(ERROR_CODE.EXTERNAL_SERVICE_ERROR, HttpStatus.NOT_IMPLEMENTED);
    }
    return c;
  }

  get appUrl(): string {
    return (process.env.SHOPIFY_APP_URL ?? '').replace(/\/+$/, '');
  }

  /** Build the Shopify authorize URL and persist the state nonce. */
  async buildInstallUrl(shop: string): Promise<string> {
    const c = this.config();
    if (!SHOP_RE.test(shop)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const state = randomBytes(16).toString('hex');
    await this.redis.set(`shopify:oauth:${state}`, shop, STATE_TTL_SEC);
    const params = new URLSearchParams({
      client_id: c.apiKey,
      scope: c.scopes,
      redirect_uri: `${c.appUrl}/api/v1/auth/shopify/callback`,
      state,
    });
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  /** Verify the callback, exchange the code, and store the tenant credential. */
  async handleCallback(query: Record<string, string>): Promise<{ shop: string; tenantId: number }> {
    const c = this.config();
    const shop = query.shop ?? '';
    const code = query.code ?? '';
    const state = query.state ?? '';
    if (!SHOP_RE.test(shop) || !code || !state) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (!verifyShopifyQueryHmac(query, c.apiSecret)) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
    const savedShop = await this.redis.get(`shopify:oauth:${state}`);
    if (!savedShop || savedShop !== shop) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
    await this.redis.del(`shopify:oauth:${state}`);

    const token = await this.exchangeCodeForToken(shop, code, c);
    const tenant = await this.tenantService.upsertByShopDomain(shop);
    await this.tenantService.upsertCredential(
      tenant.id,
      SHOPIFY,
      JSON.stringify({ accessToken: token }),
    );
    this.logger.log(`Shopify OAuth connected shop=${shop} tenant=${tenant.id}`);
    return { shop, tenantId: tenant.id };
  }

  private async exchangeCodeForToken(shop: string, code: string, c: OAuthConfig): Promise<string> {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: c.apiKey, client_secret: c.apiSecret, code }),
    });
    if (!res.ok) {
      throw new BusinessException(ERROR_CODE.EXTERNAL_SERVICE_ERROR, HttpStatus.BAD_GATEWAY);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new BusinessException(ERROR_CODE.EXTERNAL_SERVICE_ERROR, HttpStatus.BAD_GATEWAY);
    }
    return data.access_token;
  }
}
