import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CJM_STAGE, CONSENT_STATE, SESSION_IDENTITY, SESSION_LANGUAGE } from '@ivy/types';
import { generateToken } from '@ivy/common';
import { Session } from './entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Version tag of the consent notice text (PRV-M4). Bump when the widget's
 * privacy-notice wording changes so recorded choices reference what was shown.
 */
export const CONSENT_NOTICE_VERSION = '2026-07';

/** TTL for the token→session Redis cache (PERF-11). */
const SESSION_CACHE_TTL_SEC = 30;

/**
 * Redis key for the token→session cache. Exported so the few modules that
 * mutate sessions directly (order guest-bind, agent link, privacy erasure) can
 * invalidate without importing SessionService (avoids module cycles).
 */
export function sessionCacheKey(token: string): string {
  return `sess:tok:${token}`;
}

/**
 * Session lifecycle (S1 / FN-006). Creates or resumes a widget session, tracks
 * CCPA consent, and resolves UI language. Emits a CJM Awareness event on create.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly bus: EventBusService,
    private readonly redis: RedisService,
  ) {}

  async ensure(token: string | undefined, locale: string | undefined, shopDomain?: string): Promise<Session> {
    if (token) {
      const existing = await this.sessionRepo.findOne({ where: { sessionToken: token } });
      if (existing) return existing;
    }
    const tenant = await this.resolveTenant(shopDomain);

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        sessionToken: generateToken(),
        tenantId: tenant.id,
        language: this.resolveLanguage(locale),
        consentState: CONSENT_STATE.PENDING,
        customerId: null,
        identityLevel: SESSION_IDENTITY.GUEST,
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      tenantId: tenant.id,
      sessionId: session.id,
      customerId: null,
      stage: CJM_STAGE.AWARENESS,
      eventType: 'session_start',
    });
    return session;
  }

  /**
   * Resolve the tenant a new session binds to (multitenancy — POL, CLAUDE.md §6).
   * - `shop_domain` given  → must match a tenant, else reject (no silent binding).
   * - `shop_domain` absent → only default when exactly one tenant exists (single
   *   store / dev). With multiple tenants we refuse to guess to avoid cross-tenant leak.
   */
  private async resolveTenant(shopDomain?: string): Promise<Tenant> {
    if (shopDomain) {
      const tenant = await this.tenantRepo.findOne({ where: { shopDomain } });
      if (!tenant) throw new BusinessException(ERROR_CODE.TENANT_NOT_FOUND, HttpStatus.NOT_FOUND);
      return tenant;
    }
    const [tenants, count] = await this.tenantRepo.findAndCount({ order: { id: 'ASC' }, take: 1 });
    if (count === 1) return tenants[0];
    throw new BusinessException(ERROR_CODE.TENANT_NOT_FOUND, HttpStatus.BAD_REQUEST);
  }

  /**
   * Create a fresh session already bound to a customer. Used by the Shopify app
   * proxy once a storefront customer's identity is Shopify-verified — the widget
   * adopts this token and starts authenticated (customerId != null).
   */
  async createForCustomer(
    tenantId: number,
    customerId: number,
    locale?: string,
  ): Promise<Session> {
    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        sessionToken: generateToken(),
        tenantId,
        language: this.resolveLanguage(locale),
        consentState: CONSENT_STATE.PENDING,
        customerId,
        identityLevel: SESSION_IDENTITY.VERIFIED,
      }),
    );
    await this.bus.publish(EVENTS.CJM, {
      tenantId,
      sessionId: session.id,
      customerId,
      stage: CJM_STAGE.AWARENESS,
      eventType: 'session_start',
    });
    return session;
  }

  /** Resolve a tenant by its Shopify shop domain (null when unknown). */
  async findTenantByShop(shopDomain: string): Promise<Tenant | null> {
    return this.tenantRepo.findOne({ where: { shopDomain } });
  }

  /**
   * Token→session lookup, Redis-cached for 30s (PERF-11): the widget hits this
   * on every poll/message. Mutation sites (consent, language, customer binding,
   * erasure) invalidate via `sessionCacheKey`.
   */
  async findByToken(token: string): Promise<Session> {
    if (this.redis.available()) {
      const hit = await this.redis.get(sessionCacheKey(token));
      if (hit) return JSON.parse(hit) as Session;
    }
    const session = await this.loadByToken(token);
    await this.redis.set(sessionCacheKey(token), JSON.stringify(session), SESSION_CACHE_TTL_SEC);
    return session;
  }

  /** Uncached DB load — used before mutations so we never save a cached copy. */
  private async loadByToken(token: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return session;
  }

  async setConsent(token: string, granted: boolean): Promise<Session> {
    const session = await this.loadByToken(token);
    session.consentState = granted ? CONSENT_STATE.GRANTED : CONSENT_STATE.DECLINED;
    // Auditable proof of the choice: when + which notice version (PRV-M4).
    session.consentAt = new Date();
    session.consentVersion = CONSENT_NOTICE_VERSION;
    const saved = await this.sessionRepo.save(session);
    await this.redis.del(sessionCacheKey(token));
    return saved;
  }

  async setLanguage(token: string, language: string): Promise<Session> {
    const session = await this.loadByToken(token);
    session.language = this.resolveLanguage(language);
    const saved = await this.sessionRepo.save(session);
    await this.redis.del(sessionCacheKey(token));
    return saved;
  }

  async bindCustomer(sessionId: number, customerId: number): Promise<void> {
    await this.sessionRepo.update({ id: sessionId }, { customerId });
  }

  private resolveLanguage(locale?: string): string {
    const l = (locale ?? '').toLowerCase();
    if (l.startsWith('es')) return SESSION_LANGUAGE.ES;
    if (l.startsWith('ko')) return SESSION_LANGUAGE.KO;
    return SESSION_LANGUAGE.EN;
  }
}
