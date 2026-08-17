import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  CJM_STAGE,
  CONSENT_STATE,
  ConsentState,
  SESSION_IDENTITY,
  SESSION_LANGUAGE,
  sessionLanguageForLocale,
  sessionLanguageForTimezone,
  WIDGET_LOGIN_MODE,
  WidgetCopy,
  WidgetLoginMode,
} from '@ivy/types';
import { generateToken } from '@ivy/common';
import { Session } from './entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Customer } from '../customer/entity/customer.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Platform-default version tag of the consent notice text (PRV-M4). Bump when
 * the widget's privacy-notice wording changes so recorded choices reference
 * what was shown. Tenants may override via tenants.consent_notice_version
 * (Stage 2, PLN-Privacy-Control-Gap) — the tenant value wins when set.
 */
export const CONSENT_NOTICE_VERSION = '2026-07';

/** Tenant-facing widget config (privacy notice + behavior) served with /session/ensure. */
export interface PrivacyNoticeInfo {
  privacyPolicyUrl: string | null;
  /** Effective notice version: tenant override ?? platform default. */
  consentNoticeVersion: string;
  /** How the widget's "Sign in" opens the storefront login. */
  widgetLoginMode: WidgetLoginMode;
  /** Tenant widget copy; displayName already resolved (config ?? tenant name). */
  widgetCopy: WidgetCopy;
}

/** TTL for the token→session Redis cache (PERF-11). */
const SESSION_CACHE_TTL_SEC = 30;

/**
 * How long a verified session stays resumable, measured from its last activity.
 * Long enough to span a shopping visit (so navigating the store keeps the chat
 * thread) without resurrecting a conversation from days ago.
 */
const SESSION_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
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
        language: this.resolveLanguage(locale, tenant.timezone),
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
   * Admin console sandbox session (PLN-AiSetting-Preview W1). Bound to the
   * admin's own tenant with channel='preview': the chat pipeline runs for real
   * (persona/rules/KB/moderation) but the session is exempt from the consent
   * gate and never fans out escalation alerts or enters the agent queue.
   * No CJM event — preview traffic must not pollute journey analytics.
   */
  async createPreview(tenantId: number, locale?: string): Promise<Session> {
    return this.sessionRepo.save(
      this.sessionRepo.create({
        sessionToken: generateToken(),
        tenantId,
        channel: 'preview',
        language: this.resolveLanguage(locale),
        consentState: CONSENT_STATE.GRANTED,
        customerId: null,
        identityLevel: SESSION_IDENTITY.GUEST,
      }),
    );
  }

  /**
   * Display name of the session's bound customer, or null (guest, or the profile
   * has not been filled in yet). Tenant-scoped: the customer must belong to the
   * session's tenant, so a session can never surface another store's shopper.
   */
  async customerDisplayName(session: Session): Promise<string | null> {
    if (session.customerId == null || session.tenantId == null) return null;
    const customer = await this.customerRepo.findOne({
      where: { id: session.customerId, tenantId: session.tenantId },
      select: ['id', 'name'],
    });
    return customer?.name?.trim() || null;
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

  /**
   * Resume the customer's recent verified session, or create one.
   *
   * The app proxy re-resolves identity on **every storefront page load**, so
   * always minting a session gave a signed-in shopper a new session — and, since
   * conversations hang off `session_id`, a fresh empty chat — each time they
   * clicked a link. It also piled up rows (16 sessions for one customer in a day).
   * Reusing the last session inside the activity window keeps the conversation,
   * escalation state and consent choice intact across navigation.
   *
   * The window is rolling: touching the row on reuse extends it, so an active
   * shopper keeps their thread while a stale one starts clean. Scoped to
   * tenant+customer+verified — a guest session is never resumed this way, and the
   * token is only ever handed back after Shopify verified this same customer, so
   * reuse grants nothing a fresh session wouldn't.
   */
  async findOrCreateForCustomer(
    tenantId: number,
    customerId: number,
    locale?: string,
  ): Promise<Session> {
    const since = new Date(Date.now() - SESSION_REUSE_WINDOW_MS);
    const existing = await this.sessionRepo.findOne({
      where: {
        tenantId,
        customerId,
        identityLevel: SESSION_IDENTITY.VERIFIED,
        updatedAt: MoreThan(since),
      },
      order: { updatedAt: 'DESC' },
    });
    if (existing) {
      // Touch to roll the window forward. Language is left alone on purpose: the
      // shopper may have picked one in the widget, and the storefront locale must
      // not silently override that choice on the next page load.
      await this.sessionRepo.save(existing);
      return existing;
    }
    return this.createForCustomer(tenantId, customerId, locale);
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

  /**
   * The one place widget-session authorization is decided (POL-001).
   *
   * Every storefront endpoint that touches personal data needs the same two-tier
   * answer, and it used to be re-implemented per service — six copies of
   * `requireCustomerId` plus four inline checks. They happened to agree, but
   * nothing made them agree, which is precisely how a gap gets introduced later.
   * Routing them all through here also means they finally use the cached lookup.
   *
   * - not bound to a customer  → 401 UNAUTHORIZED
   * - `verified: true` and the binding came from a guest order lookup rather than
   *   Shopify → 403 FORBIDDEN. Guest identity is weak: enough to read one's own
   *   orders, never enough to export or erase an account (SEC-C3).
   */
  async requireCustomer(token: string, opts?: { verified?: boolean }): Promise<Session> {
    const session = await this.findByToken(token);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    if (opts?.verified && session.identityLevel !== SESSION_IDENTITY.VERIFIED) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return session;
  }

  /** Shorthand for the common case: the bound customer's id. */
  async requireCustomerId(token: string, opts?: { verified?: boolean }): Promise<number> {
    const session = await this.requireCustomer(token, opts);
    return session.customerId as number;
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
    // The version stamped is the tenant's *effective* one so a tenant override
    // does not immediately degrade a fresh grant back to pending (Stage 2).
    session.consentAt = new Date();
    session.consentVersion = await this.effectiveNoticeVersion(session.tenantId);
    const saved = await this.sessionRepo.save(session);
    await this.redis.del(sessionCacheKey(token));
    // Structured trace of the consent transition (no PII — ids/states only).
    this.logger.log(
      `consent recorded: session=${session.id} state=${saved.consentState} version=${saved.consentVersion}`,
    );
    return saved;
  }

  // ---- Consent policy (PLN-Privacy-Control-Gap Stage 1, fail-closed D-1) ----

  /**
   * Effective consent for gating processing: GRANTED only counts when it was
   * recorded against the *current* effective notice version — an outdated
   * version degrades to PENDING (re-consent required). DECLINED stays DECLINED.
   */
  getEffectiveConsent(
    session: Pick<Session, 'consentState' | 'consentVersion'>,
    currentNoticeVersion: string,
  ): ConsentState {
    if (session.consentState === CONSENT_STATE.DECLINED) return CONSENT_STATE.DECLINED;
    if (session.consentState === CONSENT_STATE.GRANTED) {
      return session.consentVersion === currentNoticeVersion
        ? CONSENT_STATE.GRANTED
        : CONSENT_STATE.PENDING;
    }
    return CONSENT_STATE.PENDING;
  }

  /**
   * Cache-bypassing consent read: selects the consent columns straight from the
   * DB. The message paths must NOT trust the 30s token→session Redis cache for
   * consent — a withdrawal must take effect immediately (fail-closed on stale).
   */
  async loadConsentFresh(
    sessionId: number,
  ): Promise<Pick<Session, 'consentState' | 'consentVersion' | 'consentAt'>> {
    const row = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: { id: true, consentState: true, consentVersion: true, consentAt: true },
    });
    if (!row) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return row;
  }

  /** Effective notice version for a tenant: tenant override ?? platform default. */
  async effectiveNoticeVersion(tenantId: number | null): Promise<string> {
    return (await this.privacyNotice(tenantId)).consentNoticeVersion;
  }

  /** Privacy-notice info (URL + effective version) served with /session/ensure. */
  async privacyNotice(tenantId: number | null): Promise<PrivacyNoticeInfo> {
    const tenant =
      tenantId != null ? await this.tenantRepo.findOne({ where: { id: tenantId } }) : null;
    return {
      privacyPolicyUrl: tenant?.privacyPolicyUrl ?? null,
      consentNoticeVersion: tenant?.consentNoticeVersion ?? CONSENT_NOTICE_VERSION,
      widgetLoginMode:
        tenant?.widgetLoginMode === WIDGET_LOGIN_MODE.POPUP
          ? WIDGET_LOGIN_MODE.POPUP
          : WIDGET_LOGIN_MODE.REDIRECT,
      widgetCopy: {
        // Resolved here so the widget never needs the tenant entity: configured
        // name ?? tenant name (kills the hardcoded-brand greeting for tenant 2).
        displayName: tenant?.widgetCopy?.displayName?.trim() || tenant?.name || null,
        firstVisit: tenant?.widgetCopy?.firstVisit ?? {},
        loginGreeting: tenant?.widgetCopy?.loginGreeting ?? {},
      },
    };
  }

  /**
   * One-stop consent gate for the message/agent paths: fresh (uncached) consent
   * read + tenant-effective notice version → effective consent state.
   */
  async effectiveConsentFor(sessionId: number, tenantId: number | null): Promise<ConsentState> {
    const fresh = await this.loadConsentFresh(sessionId);
    const version = await this.effectiveNoticeVersion(tenantId);
    return this.getEffectiveConsent(fresh, version);
  }

  async setLanguage(token: string, language: string): Promise<Session> {
    const session = await this.loadByToken(token);
    session.language = this.resolveLanguage(language);
    // An explicit choice outranks detection from here on (PLN-260813 D3).
    session.languageLocked = 1;
    const saved = await this.sessionRepo.save(session);
    await this.redis.del(sessionCacheKey(token));
    return saved;
  }

  /**
   * Move a session to the language the shopper is actually writing in
   * (PLN-260813 P2). Unlike `setLanguage` this does NOT lock: it is an
   * inference, and a later explicit pick must still win.
   *
   * The caller holds the `Session` object the rest of the turn reads from, so
   * it is mutated here too — otherwise the system message of the very turn that
   * triggered the switch would still go out in the old language.
   */
  async applyDetectedLanguage(session: Session, language: string): Promise<void> {
    session.language = language;
    await this.sessionRepo.update({ id: session.id }, { language });
    await this.redis.del(sessionCacheKey(session.sessionToken));
    this.logger.log(`session language detected: session=${session.id} → ${language}`);
  }

  async bindCustomer(sessionId: number, customerId: number): Promise<void> {
    await this.sessionRepo.update({ id: sessionId }, { customerId });
  }

  /**
   * Resolve a session's UI language. An explicit non-English locale is always
   * honoured; when the shopper gives no clear preference, the tenant's
   * configured timezone decides the default (요구사항: Asia/Seoul → Korean,
   * America/New_York → English). Falls back to English when neither applies.
   *
   * Both mappings come from the @ivy/types registry, so a newly registered
   * language is understood here without touching this file (REQ-260817 G6).
   */
  /**
   * Language for a session opened from an external messenger (PLN-260812 S3).
   *
   * Platform hint first, then the tenant's own default. Relay channels send no
   * locale at all, and defaulting straight to English put English privacy and
   * handoff notices into Korean KakaoTalk rooms.
   */
  async languageForChannel(tenantId: number | null, localeHint?: string | null): Promise<string> {
    const tenant = tenantId != null ? await this.tenantRepo.findOne({ where: { id: tenantId } }) : null;
    return this.resolveLanguage(localeHint ?? undefined, tenant?.timezone);
  }

  private resolveLanguage(locale?: string, timezone?: string | null): string {
    const explicit = sessionLanguageForLocale(locale);
    // English is treated as "no preference expressed": an en-US browser in a
    // Seoul tenant should still get Korean, which is the behaviour tenants
    // configured their timezone for.
    if (explicit && explicit !== SESSION_LANGUAGE.EN) return explicit;
    return sessionLanguageForTimezone(timezone) ?? SESSION_LANGUAGE.EN;
  }
}
