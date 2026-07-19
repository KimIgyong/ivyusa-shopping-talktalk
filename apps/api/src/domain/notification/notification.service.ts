import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './entity/notification.entity';
import { NotificationPref } from './entity/notification-pref.entity';
import { Session } from '../session/entity/session.entity';
import { NotifyInput } from './dto/response/notification.response';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** TTL for the unread-badge count cache (PERF-11) — widget polls it every 30s. */
const UNREAD_CACHE_TTL_SEC = 20;

function unreadCacheKey(customerId: number): string {
  return `notif:unread:${customerId}`;
}

const EXTERNAL_CHANNELS = ['email', 'sms', 'web_push'] as const;

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
      const enabled = await this.isChannelEnabled(customerId, channel, input.category);
      if (!enabled) {
        this.logger.debug(`channel ${channel} disabled for customer ${customerId} / ${input.category}`);
        continue;
      }
      // External delivery is mocked — record a row per enabled channel.
      this.logger.debug(`mock-deliver ${channel} -> customer ${customerId}: ${input.title}`);
      created.push(await this.createRow(input, channel, customerId, sessionId));
    }

    return created;
  }

  private async createRow(
    input: NotifyInput,
    channel: string,
    customerId: number | null,
    sessionId: number | null,
  ): Promise<Notification> {
    if (customerId != null) await this.redis.del(unreadCacheKey(customerId));
    return this.notifRepo.save(
      this.notifRepo.create({
        customerId,
        sessionId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        statusBadge: input.statusBadge ?? null,
        channel,
        readAt: null,
      }),
    );
  }

  /** Default enabled if no pref row exists. */
  private async isChannelEnabled(
    customerId: number | null,
    channel: string,
    category: string,
  ): Promise<boolean> {
    if (customerId == null) return true;
    const pref = await this.prefRepo.findOne({ where: { customerId, channel, category } });
    if (!pref) return true;
    return pref.enabled === 1;
  }

  /** Resolve the customer behind a session token; throws if unauthenticated. */
  private async requireCustomerId(token: string): Promise<number> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (session.customerId == null) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return session.customerId;
  }

  async list(
    token: string,
    category: string | undefined,
    page: number,
    size: number,
  ): Promise<[Notification[], number]> {
    const customerId = await this.requireCustomerId(token);
    const where: Record<string, unknown> = { customerId };
    if (category && category !== 'all') where.category = category;
    return this.notifRepo.findAndCount({
      where,
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
      await this.redis.del(unreadCacheKey(customerId));
      return saved;
    }
    return notif;
  }

  async unreadCount(token: string): Promise<number> {
    const customerId = await this.requireCustomerId(token);
    const key = unreadCacheKey(customerId);
    if (this.redis.available()) {
      const hit = await this.redis.get(key);
      if (hit != null) return Number(hit);
    }
    const count = await this.notifRepo.count({ where: { customerId, readAt: IsNull() } });
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
