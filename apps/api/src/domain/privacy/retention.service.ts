import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { CjmEvent } from '../cjm/entity/cjm-event.entity';
import { Notification } from '../notification/entity/notification.entity';
import { Session } from '../session/entity/session.entity';
import { AuditService } from '../audit/audit.service';

export interface RetentionPurgeResult {
  retentionDays: number;
  cutoff: string;
  messages: number;
  conversations: number;
  cjmEvents: number;
  notifications: number;
  sessions: number;
}

/** First scheduled run fires shortly after boot so frequent restarts can't starve disposal. */
const INITIAL_DELAY_MS = 5 * 60_000;

/**
 * Data retention / disposal (POL-003, PRV-H3). Conversation logs, journey events,
 * notifications, and stale sessions are disposed of once older than the configured
 * retention window. Runs on a scheduler (RETENTION_PURGE_INTERVAL_HOURS, default
 * every 24h, first run 5 min after boot; set 0 to disable) and stays manually
 * triggerable via POST /privacy/retention/purge.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @InjectRepository(Conversation) private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(CjmEvent) private readonly cjmRepo: Repository<CjmEvent>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    const raw = this.config.get<string | number>('RETENTION_PURGE_INTERVAL_HOURS', 24);
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours <= 0) {
      this.logger.log('Retention purge scheduler disabled (RETENTION_PURGE_INTERVAL_HOURS <= 0)');
      return;
    }
    this.initialTimer = setTimeout(() => void this.runScheduled(), INITIAL_DELAY_MS);
    this.timer = setInterval(() => void this.runScheduled(), hours * 3_600_000);
    this.logger.log(`Retention purge scheduled every ${hours}h (first run in 5 min)`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  private async runScheduled(): Promise<void> {
    try {
      const result = await this.purgeExpired();
      this.logger.log(
        `Retention purge: msgs=${result.messages} convs=${result.conversations} cjm=${result.cjmEvents} notifs=${result.notifications} sessions=${result.sessions}`,
      );
    } catch (err) {
      this.logger.error(`Scheduled retention purge failed: ${String(err)}`);
    }
  }

  private retentionDays(): number {
    // env values arrive as strings; coerce and fall back on a non-positive/NaN value.
    const raw = this.config.get<string | number>('CONVERSATION_LOG_RETENTION_DAYS', 365);
    const days = Number(raw);
    return Number.isFinite(days) && days > 0 ? days : 365;
  }

  /** Delete rows older than the retention window: messages → conversations → cjm → notifications → stale sessions. */
  async purgeExpired(): Promise<RetentionPurgeResult> {
    const retentionDays = this.retentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Messages first (child of conversations), then conversations, then journey events.
    const msg = await this.messageRepo.delete({ createdAt: LessThan(cutoff) });
    const conv = await this.conversationRepo.delete({ createdAt: LessThan(cutoff) });
    const cjm = await this.cjmRepo.delete({ createdAt: LessThan(cutoff) });

    // Notifications carry order numbers / PII in title+body — same window (PRV-H3).
    const notif = await this.notificationRepo.delete({ createdAt: LessThan(cutoff) });

    // Stale sessions: inactive past the window AND not referenced by a surviving
    // conversation (conversations newer than the cutoff keep their session).
    const sess = await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .where('updated_at < :cutoff', { cutoff })
      .andWhere('id NOT IN (SELECT session_id FROM conversations)')
      .execute();

    const result: RetentionPurgeResult = {
      retentionDays,
      cutoff: cutoff.toISOString(),
      messages: msg.affected ?? 0,
      conversations: conv.affected ?? 0,
      cjmEvents: cjm.affected ?? 0,
      notifications: notif.affected ?? 0,
      sessions: sess.affected ?? 0,
    };

    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId: 0,
      action: 'retention.purge',
      target: `cutoff=${result.cutoff} msgs=${result.messages} convs=${result.conversations} cjm=${result.cjmEvents} notifs=${result.notifications} sessions=${result.sessions}`,
    });

    return result;
  }
}
