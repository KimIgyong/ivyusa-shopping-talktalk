import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuditService } from '../audit/audit.service';
import { maskPii } from '../../global/util/pii.util';
import { User } from '../user/entity/user.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuthTokensResponse } from './dto/response/auth.response';

const EXCHANGE_TIMEOUT_MS = 10_000;
/** Rate-limit scope — keyed by tenant slug (no email exists before the exchange). */
const LIMITER_SCOPE = 'ama_sso';

/**
 * AMA-portal SSO (PLN-260813-AMA-Iframe-SSO S2). The AMA portal embeds the
 * console in an iframe and passes a short-lived `ama_token`; we exchange it at
 * AMA's OAuth `ama_session` grant (server-to-server, client credentials from
 * env). A successful exchange is AMA's proof the token is authentic, unexpired,
 * unrevoked, and its user active — only then do we read the identity claims
 * (email) from the token payload. AMA's /oauth/userinfo returns no email, so
 * the claim read replaces the userinfo call planned in the PLN; the integration
 * guide requires AMA to keep an `email` claim in the SSO token.
 *
 * Mapping is decision D1/D2: the tenant comes from the URL slug and the account
 * must already exist (active, same email) in that tenant — no provisioning.
 * The ShopTalk session is always our own JWT (AuthService.issueForSso).
 */
@Injectable()
export class AmaSsoService {
  private readonly logger = new Logger(AmaSsoService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
    private readonly loginLimiter: LoginRateLimitService,
    private readonly audit: AuditService,
  ) {}

  async login(amaToken: string, tenantSlug: string, clientIp: string): Promise<AuthTokensResponse> {
    const tokenUrl = this.config.get<string>('AMA_SSO_TOKEN_URL', '');
    const clientId = this.config.get<string>('AMA_SSO_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('AMA_SSO_CLIENT_SECRET', '');
    if (!tokenUrl || !clientId || !clientSecret) {
      this.logger.warn('ama sso rejected: AMA_SSO_* env is not configured');
      throw new BusinessException(ERROR_CODE.AMA_SSO_DISABLED, HttpStatus.NOT_IMPLEMENTED);
    }

    await this.loginLimiter.assertNotLocked(LIMITER_SCOPE, tenantSlug, clientIp);

    const email = await this.exchangeAndExtractEmail(
      { tokenUrl, clientId, clientSecret },
      amaToken,
      tenantSlug,
      clientIp,
    );

    // D2: the slug names the tenant; D1: only a pre-existing active account in
    // that tenant may enter. All mapping failures collapse into one error code
    // so a caller cannot probe which tenants or emails exist.
    const tenant = await this.tenantRepo.findOne({ where: { slug: tenantSlug } });
    const user = tenant
      ? await this.userRepo.findOne({ where: { tenantId: tenant.id, email } })
      : null;
    if (
      !tenant ||
      tenant.status === 'suspended' ||
      !user ||
      user.status !== 'active'
    ) {
      await this.loginLimiter.recordFailure(LIMITER_SCOPE, tenantSlug, clientIp);
      this.logger.warn(
        `ama sso rejected: no active account for ${maskPii(email)} in tenant '${tenantSlug}'`,
      );
      await this.auditSafe({
        tenantId: tenant?.id ?? null,
        actorId: 0,
        action: 'auth.sso_ama_failed',
        target: maskPii(email),
        result: 'denied',
        metadata: { reason: 'user_not_mapped', tenantSlug },
      });
      throw new BusinessException(ERROR_CODE.AMA_SSO_USER_NOT_MAPPED, HttpStatus.FORBIDDEN);
    }

    await this.loginLimiter.recordSuccess(LIMITER_SCOPE, tenantSlug);
    await this.auditSafe({
      tenantId: tenant.id,
      actorId: user.id,
      action: 'auth.sso_ama',
      target: maskPii(email),
    });
    return this.authService.issueForSso(user);
  }

  /**
   * Server-to-server `ama_session` exchange. AMA verifies signature, expiry,
   * token version (revocation) and user status; we treat a 2xx as that proof
   * and only then decode the payload locally for the email claim.
   */
  private async exchangeAndExtractEmail(
    cfg: { tokenUrl: string; clientId: string; clientSecret: string },
    amaToken: string,
    tenantSlug: string,
    clientIp: string,
  ): Promise<string> {
    let ok = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EXCHANGE_TIMEOUT_MS);
      try {
        const res = await fetch(cfg.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'ama_session',
            ama_token: amaToken,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            scope: 'profile',
          }),
          signal: controller.signal,
        });
        // AMA wraps responses in { success, data: { access_token, ... } }.
        const body = (await res.json().catch(() => null)) as {
          data?: { access_token?: string };
        } | null;
        ok = res.ok && !!body?.data?.access_token;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.warn(`ama sso token exchange unreachable: ${(err as Error).message}`);
      ok = false;
    }

    const email = ok ? this.emailClaim(amaToken) : null;
    if (!email) {
      await this.loginLimiter.recordFailure(LIMITER_SCOPE, tenantSlug, clientIp);
      if (ok) this.logger.warn('ama sso rejected: exchanged token carries no email claim');
      await this.auditSafe({
        tenantId: null,
        actorId: 0,
        action: 'auth.sso_ama_failed',
        result: 'denied',
        metadata: { reason: ok ? 'no_email_claim' : 'exchange_failed', tenantSlug },
      });
      throw new BusinessException(ERROR_CODE.AMA_TOKEN_INVALID, HttpStatus.UNAUTHORIZED);
    }
    return email;
  }

  /** Unverified local decode — safe only AFTER the exchange validated the token. */
  private emailClaim(amaToken: string): string | null {
    const payload = this.jwt.decode<{ email?: unknown } | null>(amaToken);
    const email = payload && typeof payload === 'object' ? payload.email : null;
    return typeof email === 'string' && email.includes('@') ? email : null;
  }

  /** Best-effort audit — SSO must not fail on an audit-write error (PRV-H4). */
  private async auditSafe(params: {
    tenantId: number | null;
    actorId: number;
    action: string;
    target?: string;
    result?: 'success' | 'denied';
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.audit.write({ actorType: 'user', ...params });
    } catch {
      /* audited best-effort */
    }
  }
}
