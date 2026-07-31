import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DeviceToken } from './entity/device-token.entity';
import { Session } from '../session/entity/session.entity';
import { RegisterPushRequest } from './dto/request/push.request';
import {
  PUSH_PROVIDER,
  PushMessage,
  PushProvider,
  PushTicket,
} from './provider/push-provider.interface';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Expo push tokens look like ExponentPushToken[xxxx] / ExpoPushToken[xxxx]. */
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

/** Payload published by NotificationService on EVENTS.PUSH_DISPATCH. */
export interface PushDispatchPayload {
  notificationId: number;
  tenantId: number | null;
  customerId: number | null;
  category: string;
  title: string;
  body: string | null;
  statusBadge: string | null;
}

interface PendingReceipt {
  receiptId: string;
  token: string;
  queuedAt: number;
}

/** Cap the in-memory receipt buffer (best-effort; process-lifetime only). */
const MAX_PENDING_RECEIPTS = 5000;

/**
 * Mobile push registration + delivery (REQ-MobileApp M1). Registration is
 * session-token authenticated (@Public widget/app surface); delivery consumes
 * EVENTS.PUSH_DISPATCH emitted by NotificationService AFTER the suppression
 * gate, so prefs/opt-out/fail-closed rules are already enforced upstream.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private pendingReceipts: PendingReceipt[] = [];
  private receiptTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(DeviceToken) private readonly tokenRepo: Repository<DeviceToken>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    private readonly bus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(EVENTS.PUSH_DISPATCH, async (payload: unknown) => {
      await this.dispatch(payload as PushDispatchPayload);
    });
    // Deferred delivery-receipt sweep (Expo receipts become available ~15 min
    // after send). In-memory buffer — best-effort within the process lifetime.
    const minutes = Number(process.env.PUSH_RECEIPT_SWEEP_MIN ?? '15');
    if (minutes > 0) {
      this.receiptTimer = setInterval(() => void this.sweepReceipts(), minutes * 60_000);
      this.receiptTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.receiptTimer) clearInterval(this.receiptTimer);
  }

  // ---- registration (app-facing) ----

  /** Upsert a device token, binding it to the session's tenant/customer. */
  async register(sessionToken: string, input: RegisterPushRequest): Promise<DeviceToken> {
    const session = await this.requireSession(sessionToken);
    if (!EXPO_TOKEN_RE.test(input.token)) {
      this.logger.warn(`push register rejected: malformed expo token (platform=${input.platform})`);
      throw new BusinessException(ERROR_CODE.PUSH_TOKEN_INVALID, HttpStatus.BAD_REQUEST);
    }

    const existing = await this.tokenRepo.findOne({ where: { token: input.token } });
    const row = existing ?? this.tokenRepo.create({ token: input.token, provider: 'expo' });
    // Re-registration rebinds identity: an anonymous install upgrading to a
    // verified session moves the token onto the customer.
    row.tenantId = session.tenantId;
    row.customerId = session.customerId;
    row.sessionId = session.id;
    row.platform = input.platform;
    row.locale = input.locale ?? null;
    row.appVersion = input.app_version ?? null;
    row.lastSeenAt = new Date();
    row.revokedAt = null;
    return this.tokenRepo.save(row);
  }

  /** Revoke a device token (logout/uninstall path). Idempotent. */
  async unregister(sessionToken: string, token: string): Promise<void> {
    await this.requireSession(sessionToken);
    const row = await this.tokenRepo.findOne({ where: { token } });
    if (!row || row.revokedAt != null) return;
    row.revokedAt = new Date();
    await this.tokenRepo.save(row);
  }

  // ---- delivery (bus consumer) ----

  /**
   * Fan a suppressed-checked notification out to the customer's active devices.
   * Push previews are on the lock screen: `body` here is the notification body
   * the emitter chose for external channels — chat replies deliberately send a
   * generic localized body, never message content (PLN-MobileApp privacy note).
   */
  async dispatch(payload: PushDispatchPayload): Promise<void> {
    if (payload.customerId == null) return; // upstream gate already fail-closed
    const where: Record<string, unknown> = { customerId: payload.customerId, revokedAt: IsNull() };
    if (payload.tenantId != null) where.tenantId = payload.tenantId;
    const tokens = await this.tokenRepo.find({ where });
    if (tokens.length === 0) return;

    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: {
        category: payload.category,
        notificationId: payload.notificationId,
        statusBadge: payload.statusBadge,
      },
    }));
    const tickets = await this.provider.send(messages);
    await this.handleTickets(tickets);
    const sent = tickets.filter((t) => t.ok).length;
    this.logger.log(
      `push dispatch notif=${payload.notificationId} customer=${payload.customerId} devices=${tokens.length} sent=${sent}`,
    );
  }

  private async handleTickets(tickets: PushTicket[]): Promise<void> {
    for (const ticket of tickets) {
      if (ticket.shouldRevoke) {
        await this.revokeByToken(ticket.token, 'ticket DeviceNotRegistered');
      } else if (ticket.ok && ticket.receiptId) {
        if (this.pendingReceipts.length < MAX_PENDING_RECEIPTS) {
          this.pendingReceipts.push({
            receiptId: ticket.receiptId,
            token: ticket.token,
            queuedAt: Date.now(),
          });
        }
      } else if (!ticket.ok) {
        this.logger.warn(`push ticket error (${ticket.error}) token=${this.maskToken(ticket.token)}`);
      }
    }
  }

  /** Check deferred receipts; revoke tokens the provider reports as dead. */
  async sweepReceipts(): Promise<void> {
    // Expo recommends waiting ~15 min before checking receipts.
    const ready = this.pendingReceipts.filter((p) => Date.now() - p.queuedAt >= 14 * 60_000);
    if (ready.length === 0) return;
    this.pendingReceipts = this.pendingReceipts.filter((p) => !ready.includes(p));
    const byReceipt = new Map(ready.map((p) => [p.receiptId, p.token]));
    const receipts = await this.provider.getReceipts([...byReceipt.keys()]);
    for (const r of receipts) {
      if (r.shouldRevoke) {
        const token = byReceipt.get(r.receiptId);
        if (token) await this.revokeByToken(token, 'receipt DeviceNotRegistered');
      } else if (!r.ok) {
        this.logger.warn(`push receipt error (${r.error}) receipt=${r.receiptId}`);
      }
    }
  }

  private async revokeByToken(token: string, reason: string): Promise<void> {
    await this.tokenRepo.update({ token, revokedAt: IsNull() }, { revokedAt: new Date() });
    this.logger.log(`push token revoked (${reason}): ${this.maskToken(token)}`);
  }

  /** Tokens are device credentials — never log them whole. */
  private maskToken(token: string): string {
    return token.length <= 12 ? '***' : `${token.slice(0, 18)}…`;
  }

  private async requireSession(token: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken: token } });
    if (!session) throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    return session;
  }
}
