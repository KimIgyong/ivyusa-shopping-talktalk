import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { SessionService } from '../session/session.service';
import { CustomerService } from '../customer/customer.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { Cafe24TokenService } from './cafe24-token.service';
import { Cafe24AdminClient, cafe24AuthHost } from './cafe24-admin.client';
import { Cafe24SyncService } from './cafe24-sync.service';

const STATE_TTL_SEC = 600;
const TICKET_TTL_SEC = 60;
const MALL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/;

interface CustomerAuthState {
  tenantId: number;
  mallId: string;
  returnUrl: string;
}

/**
 * Cafe24 storefront member sign-in (PLN-260808 P-A2). Cafe24 has no Shopify-style
 * App Proxy, so the widget can't learn who is logged in on the mall. This bridges
 * that with Cafe24's own "customer authentication" (customeraccesstoken) OAuth:
 * authorize → token → GET /customers/identifier yields a SERVER-verified
 * `user_identifier`, which we bind to a widget session. The customer access token
 * never leaves the backend; the storefront only ever receives a one-time ticket.
 *
 * All three front calls hit the mall's primary domain ({mall}.cafe24.com), distinct
 * from the admin API host ({mall}.cafe24api.com) used by P-A1 order sync.
 */
@Injectable()
export class Cafe24CustomerAuthService {
  private readonly logger = new Logger(Cafe24CustomerAuthService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly sessionService: SessionService,
    private readonly customerService: CustomerService,
    private readonly tokenService: Cafe24TokenService,
    private readonly adminClient: Cafe24AdminClient,
    private readonly syncService: Cafe24SyncService,
  ) {}

  private redirectUri(): string {
    return (
      process.env.CAFE24_CUSTOMER_REDIRECT_URI ??
      'https://shoptalk.amoeba.site/api/v1/public/cafe24/customer-auth/callback'
    );
  }
  private scopes(): string {
    return process.env.CAFE24_CUSTOMER_SCOPES ?? 'mall.read_customer_identifier';
  }

  /** Normalize a storefront host to a Cafe24 mall id, or null if it isn't one. */
  private mallIdFromHost(host: string): string | null {
    const h = host.trim().toLowerCase();
    const m = /^([a-z0-9][a-z0-9_-]{1,59})\.cafe24\.com$/.exec(h);
    const mall = m ? m[1] : h.replace(/\.cafe24(api)?\.com.*$/i, '');
    return MALL_ID_RE.test(mall) ? mall : null;
  }

  /**
   * Only ever redirect the browser back to the mall's own storefront — never an
   * attacker-supplied origin. Accepts the mall's primary Cafe24 domain; anything
   * else collapses to the mall root.
   */
  private safeReturnUrl(returnUrl: string, mallId: string): string {
    const fallback = `https://${mallId}.cafe24.com/`;
    try {
      const u = new URL(returnUrl);
      if (u.protocol !== 'https:') return fallback;
      return u.hostname.toLowerCase() === `${mallId}.cafe24.com` ? u.toString() : fallback;
    } catch {
      return fallback;
    }
  }

  /** Build the customer authorize URL for a storefront host. Called @Public. */
  async start(host: string, returnUrl: string): Promise<string> {
    Cafe24TokenService.appConfig(); // E5010 if the app isn't configured
    const mallId = this.mallIdFromHost(host);
    if (!mallId) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    const tenantId = await this.tokenService.findTenantIdByMallId(mallId);
    if (tenantId == null) {
      throw new BusinessException(ERROR_CODE.CAFE24_NOT_CONNECTED, HttpStatus.NOT_FOUND);
    }
    const safeReturn = this.safeReturnUrl(returnUrl, mallId);
    const state = randomBytes(16).toString('hex');
    await this.redis.set(
      `cafe24:cust:state:${state}`,
      JSON.stringify({ tenantId, mallId, returnUrl: safeReturn } satisfies CustomerAuthState),
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
    return `${cafe24AuthHost(mallId)}/api/v2/oauth/authorize?${params.toString()}`;
  }

  /**
   * Cafe24 redirects here with code+state. Verify, mint a customer access token,
   * read the verified identifier, bind a session, and hand back a one-time ticket
   * plus the storefront URL to return to. Never returns the session token in the URL.
   */
  async handleCallback(query: Record<string, string>): Promise<{ returnUrl: string; ticket: string }> {
    const code = query.code ?? '';
    const state = query.state ?? '';
    if (!code || !state) {
      throw new BusinessException(ERROR_CODE.CAFE24_CUSTOMER_STATE_INVALID, HttpStatus.BAD_REQUEST);
    }
    const raw = await this.redis.get(`cafe24:cust:state:${state}`);
    if (!raw) {
      throw new BusinessException(ERROR_CODE.CAFE24_CUSTOMER_STATE_INVALID, HttpStatus.UNAUTHORIZED);
    }
    await this.redis.del(`cafe24:cust:state:${state}`);
    const parsed = JSON.parse(raw) as CustomerAuthState;

    const accessToken = await this.exchangeCode(parsed.mallId, code);
    const userIdentifier = await this.fetchIdentifier(parsed.mallId, accessToken);

    const customer = await this.customerService.findOrCreateByCafe24Identifier(
      parsed.tenantId,
      userIdentifier,
    );
    // Enrich the identifier-keyed row with the shopper's email + order history so
    // "my orders" populates. Fire-and-forget (never blocks the sign-in handshake),
    // exactly like the Shopify app-proxy identity path.
    void this.backfillOrders(parsed.tenantId, parsed.mallId, userIdentifier);

    const session = await this.sessionService.findOrCreateForCustomer(
      parsed.tenantId,
      customer.id,
    );
    const ticket = randomBytes(24).toString('hex');
    await this.redis.set(`cafe24:cust:ticket:${ticket}`, session.sessionToken, TICKET_TTL_SEC);
    this.logger.log(
      `customer-auth ok tenant=${parsed.tenantId} mall=${parsed.mallId} customer=${customer.id}`,
    );
    return { returnUrl: parsed.returnUrl, ticket };
  }

  /** Redeem a one-time ticket for the widget session token. Deletes on read. */
  async exchangeTicket(ticket: string): Promise<{ sessionToken: string }> {
    const key = `cafe24:cust:ticket:${ticket}`;
    const token = ticket ? await this.redis.get(key) : null;
    if (!token) {
      throw new BusinessException(ERROR_CODE.CAFE24_CUSTOMER_TICKET_INVALID, HttpStatus.UNAUTHORIZED);
    }
    await this.redis.del(key);
    return { sessionToken: token };
  }

  private async exchangeCode(mallId: string, code: string): Promise<string> {
    const { clientId, clientSecret } = Cafe24TokenService.appConfig();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${cafe24AuthHost(mallId)}/api/v2/oauth/token`, {
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
      this.logger.warn(`cafe24 customer token exchange failed mall=${mallId}: ${res.status}`);
      throw new BusinessException(ERROR_CODE.CAFE24_CUSTOMER_TOKEN_FAILED, HttpStatus.BAD_GATEWAY);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new BusinessException(ERROR_CODE.CAFE24_CUSTOMER_TOKEN_FAILED, HttpStatus.BAD_GATEWAY);
    }
    return data.access_token;
  }

  private async fetchIdentifier(mallId: string, customerAccessToken: string): Promise<string> {
    // Per Cafe24 docs the identifier endpoint takes `Authorization: Basic <token>`
    // (the customer access token verbatim, not base64 client creds).
    const res = await fetch(`${cafe24AuthHost(mallId)}/api/v2/customers/identifier`, {
      method: 'GET',
      headers: { Authorization: `Basic ${customerAccessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      this.logger.warn(`cafe24 customer identifier failed mall=${mallId}: ${res.status}`);
      throw new BusinessException(
        ERROR_CODE.CAFE24_CUSTOMER_IDENTIFIER_FAILED,
        HttpStatus.BAD_GATEWAY,
      );
    }
    const data = (await res.json()) as { identifier?: { user_identifier?: string } };
    const uid = data.identifier?.user_identifier;
    if (!uid) {
      throw new BusinessException(
        ERROR_CODE.CAFE24_CUSTOMER_IDENTIFIER_FAILED,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return uid;
  }

  /**
   * Best-effort: map the verified member (user_identifier) to their email via the
   * Admin API and link it onto the row, then pull their orders (J1 join). Never
   * throws — the sign-in already succeeded; on any hiccup the shopper is
   * authenticated but "my orders" stays empty until the next order sync.
   */
  private async backfillOrders(
    tenantId: number,
    mallId: string,
    userIdentifier: string,
  ): Promise<void> {
    try {
      const conn = await this.tokenService.getConnection(tenantId);
      if (!conn) return;
      const profile = await this.adminClient.fetchCustomerByIdentifier(
        conn.mallId,
        conn.accessToken,
        userIdentifier,
      );
      if (profile?.email) {
        await this.customerService.linkCafe24Customer(
          tenantId,
          profile.email,
          profile.name ?? undefined,
          userIdentifier,
        );
      }
      await this.syncService.syncOrders(tenantId);
    } catch (err) {
      this.logger.debug(
        `cafe24 customer order backfill skipped mall=${mallId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }
}
