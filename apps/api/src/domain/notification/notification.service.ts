import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Notification } from './entity/notification.entity';
import { NotificationPref } from './entity/notification-pref.entity';
import { Session } from '../session/entity/session.entity';
import { SessionService } from '../session/session.service';
import { NotifyInput } from './dto/response/notification.response';
import { NOTIFICATION_SCOPE, ORDER_NOTIFICATION_CATEGORIES } from '@ivy/types';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** TTL for the unread-badge count cache (PERF-11) — widget polls it every 30s. */
const UNREAD_CACHE_TTL_SEC = 20;

/** Per-scope, because the widget may show two badges that must not share a cache. */
function unreadCacheKey(customerId: number, scope?: string): string {
  return scope ? `notif:unread:${customerId}:${scope}` : `notif:unread:${customerId}`;
}

/**
 * Every cache key a customer's unread count can live under. Invalidation must
 * clear all of them: dropping only the unscoped key would leave a per-tab badge
 * showing a count the shopper has already read away.
 */
function unreadCacheKeys(customerId: number): string[] {
  return [
    unreadCacheKey(customerId),
    unreadCacheKey(customerId, NOTIFICATION_SCOPE.ORDER),
    unreadCacheKey(customerId, NOTIFICATION_SCOPE.NOTICE),
  ];
}

/**
 * Build the WHERE for a feed request, honouring the order/notice split.
 *
 * An explicit `category` always wins — a chip asks for exactly one thing. The
 * scope only decides what "all" means, which is the whole point: with both list
 * tabs on, Notifications' "All" must NOT include the order rows the Orders tab
 * is already showing, or the chip split buys nothing.
 */
function scopedWhere(
  customerId: number,
  category: string | undefined,
  scope: string | undefined,
): Record<string, unknown> {
  const where: Record<string, unknown> = { customerId };
  if (category && category !== 'all') {
    where.category = category;
    return where;
  }
  if (scope === NOTIFICATION_SCOPE.ORDER) {
    where.category = In([...ORDER_NOTIFICATION_CATEGORIES]);
  } else if (scope === NOTIFICATION_SCOPE.NOTICE) {
    where.category = Not(In([...ORDER_NOTIFICATION_CATEGORIES]));
  }
  return where;
}

const EXTERNAL_CHANNELS = ['email', 'sms', 'web_push', 'push'] as const;

/**
 * Transactional categories may default-allow on external channels when the
 * customer has no explicit pref row; everything else (marketing: event/review)
 * is default-DENY per approved decision D-4 (Stage 6). 'chat' (agent replies
 * to the mobile app) is a service notification — transactional.
 */
const TRANSACTIONAL_CATEGORIES = ['payment', 'shipping', 'chat'] as const;

/**
 * Customer/session notifications (FR-030/031). Always creates an in-app
 * notification on EVENTS.NOTIFICATION; honors per-customer prefs for external
 * channels (mocked delivery -> a notification row per enabled channel).
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationPref) private readonly prefRepo: Repository<NotificationPref>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    private readonly sessionService: SessionService,
    private readonly bus: EventBusService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(EVENTS.NOTIFICATION, async (payload: unknown) => {
      await this.notify(payload as NotifyInput);
    });
  }

  /**
   * Create notifications for the given input. Always creates an in-app row.
   * If the input requests an external channel (or no channel), it additionally
   * fans out to enabled external channels per the customer's preferences.
   * Idempotent enough: re-delivery just appends rows the UI dedupes by id.
   */
  async notify(input: NotifyInput): Promise<Notification[]> {
    const customerId = input.customerId ?? null;
    const sessionId = input.sessionId ?? null;
    const created: Notification[] = [];

    // In-app is transactional/always-on.
    created.push(await this.createRow(input, 'in_app', customerId, sessionId));

    // Determine which external channels to attempt.
    const requested = input.channel && input.channel !== 'in_app' ? [input.channel] : [];
    const externalTargets =
      requested.length > 0
        ? requested.filter((c) => (EXTERNAL_CHANNELS as readonly string[]).includes(c))
        : [...EXTERNAL_CHANNELS];

    for (const channel of externalTargets) {
      const suppressed = await this.isSuppressed(customerId, channel, input.category);
      if (suppressed) continue; // reason already logged by isSuppressed
      const row = await this.createRow(input, channel, customerId, sessionId);
      created.push(row);
      if (channel === 'push') {
        // Real delivery: hand off to the push module (device-token fan-out).
        // Decoupled via the bus so NotificationModule stays provider-agnostic.
        await this.bus.publish(EVENTS.PUSH_DISPATCH, {
          notificationId: row.id,
          tenantId: input.tenantId ?? null,
          customerId,
          category: input.category,
          title: input.title,
          body: input.body ?? null,
          statusBadge: input.statusBadge ?? null,
          linkUrl: input.linkUrl ?? null,
          productHandle: input.productHandle ?? null,
        });
      } else {
        // email/sms/web_push delivery is still mocked — row only.
        this.logger.debug(`mock-deliver ${channel} -> customer ${customerId}: ${input.title}`);
      }
    }

    return created;
  }

  private async createRow(
    input: NotifyInput,
    channel: string,
    customerId: number | null,
    sessionId: number | null,
  ): Promise<Notification> {
    if (customerId != null) {
      await Promise.all(unreadCacheKeys(customerId).map((k) => this.redis.del(k)));
    }
    return this.notifRepo.save(
      this.notifRepo.create({
        // Explicit tenantId: this insert runs detached from the request (bus
        // handler), so the ALS TenantSubscriber cannot stamp it.
        tenantId: input.tenantId ?? null,
        customerId,
        sessionId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        statusBadge: input.statusBadge ?? null,
        linkUrl: input.linkUrl ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        channel,
        readAt: null,
      }),
    );
  }

  /**
   * Single suppression decision point for EXTERNAL channels (Stage 6, D-4).
   * - No identified recipient → suppressed (fail-closed: never send external
   *   to an anonymous session).
   * - Explicit pref row → follow it (opt-out AND re-consent both honored).
   * - No row → transactional (payment/shipping) allowed; marketing
   *   (event/review) default-DENY.
   * in_app is not routed through here — it is always-on by design.
   */
  async isSuppressed(customerId: number | null, channel: string, category: string): Promise<boolean> {
    if (customerId == null) {
      this.logger.debug(`suppress ${channel}/${category}: no identified recipient (fail-closed)`);
      return true;
    }
    const pref = await this.prefRepo.findOne({ where: { customerId, channel, category } });
    if (pref) {
      const suppressed = pref.enabled !== 1;
      if (suppressed) {
        this.logger.debug(`suppress ${channel}/${category} for customer ${customerId}: pref disabled`);
      }
      return suppressed;
    }
    const transactional = (TRANSACTIONAL_CATEGORIES as readonly string[]).includes(category);
    if (!transactional) {
      this.logger.debug(
        `suppress ${channel}/${category} for customer ${customerId}: marketing default-deny (no consent row)`,
      );
    }
    return !transactional;
  }

  /** Widget-session authorization — single implementation in SessionService. */
  private requireCustomerId(token: string): Promise<number> {
    return this.sessionService.requireCustomerId(token);
  }

  async list(
    token: string,
    category: string | undefined,
    page: number,
    size: number,
    scope?: string,
  ): Promise<[Notification[], number]> {
    const customerId = await this.requireCustomerId(token);
    return this.notifRepo.findAndCount({
      where: scopedWhere(customerId, category, scope),
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  async markRead(token: string, id: number): Promise<Notification> {
    const customerId = await this.requireCustomerId(token);
    const notif = await this.notifRepo.findOne({ where: { id } });
    if (!notif || notif.customerId !== customerId) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (notif.readAt == null) {
      notif.readAt = new Date();
      const saved = await this.notifRepo.save(notif);
      await Promise.all(unreadCacheKeys(customerId).map((k) => this.redis.del(k)));
      return saved;
    }
    return notif;
  }

  /**
   * Unread count, optionally for one half of the feed.
   *
   * The widget can show two list tabs whose badges must add up to the whole and
   * never double-count, so the split is computed here rather than by tallying a
   * page of rows on the client — a page is capped at `size`, which would make
   * both badges wrong the moment a shopper has more unread than fits on one.
   */
  async unreadCount(token: string, scope?: string): Promise<number> {
    const customerId = await this.requireCustomerId(token);
    const key = unreadCacheKey(customerId, scope);
    if (this.redis.available()) {
      const hit = await this.redis.get(key);
      if (hit != null) return Number(hit);
    }
    const count = await this.notifRepo.count({
      where: { ...scopedWhere(customerId, 'all', scope), readAt: IsNull() },
    });
    await this.redis.set(key, String(count), UNREAD_CACHE_TTL_SEC);
    return count;
  }

  async listPrefs(token: string): Promise<NotificationPref[]> {
    const customerId = await this.requireCustomerId(token);
    return this.prefRepo.find({ where: { customerId }, order: { id: 'ASC' } });
  }

  /** Upsert a preference. in_app is always-on: disabling it is ignored. */
  async upsertPref(
    token: string,
    channel: string,
    category: string,
    enabled: boolean,
  ): Promise<NotificationPref> {
    const customerId = await this.requireCustomerId(token);
    const effectiveEnabled = channel === 'in_app' ? 1 : enabled ? 1 : 0;
    const existing = await this.prefRepo.findOne({ where: { customerId, channel, category } });
    if (existing) {
      existing.enabled = effectiveEnabled;
      return this.prefRepo.save(existing);
    }
    return this.prefRepo.save(
      this.prefRepo.create({ customerId, channel, category, enabled: effectiveEnabled }),
    );
  }
}
