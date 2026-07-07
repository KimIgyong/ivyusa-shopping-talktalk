import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentAlert } from './entity/agent-alert.entity';
import { EventBusService, EVENTS } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

interface EscalationPayload {
  tenantId?: number;
  conversationId?: number;
  sessionId?: number | null;
  reason?: string;
  preview?: string;
}

const REASON_LABEL: Record<string, string> = {
  low_confidence: 'AI could not answer from the knowledge base',
  moderation_blocked: 'AI reply blocked by moderation',
  user_request: 'Customer asked for a human agent',
};

/**
 * Escalation alarm fan-out (FR-S3, PLAN-Scenario-Handoff-Alert §3.3).
 * Subscribes to EVENTS.ESCALATION and (1) stores an agent_alerts row for the
 * console alarm modal, (2) posts to a Slack incoming webhook, (3) sends an
 * email via SMTP. Slack/email are best-effort and individually isolated —
 * the DB alert is always written first. Channels are disabled when their env
 * config is empty (dev default).
 */
@Injectable()
export class AgentAlertService implements OnModuleInit {
  private readonly logger = new Logger(AgentAlertService.name);

  constructor(
    @InjectRepository(AgentAlert) private readonly alertRepo: Repository<AgentAlert>,
    private readonly bus: EventBusService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(EVENTS.ESCALATION, async (payload: unknown) => {
      await this.onEscalation((payload ?? {}) as EscalationPayload);
    });
  }

  async onEscalation(payload: EscalationPayload): Promise<void> {
    if (!payload.conversationId) return;
    // Idempotency (at-least-once bus): skip if an un-acked alert already exists
    // for this conversation with the same reason.
    const existing = await this.alertRepo.findOne({
      where: {
        conversationId: payload.conversationId,
        reason: payload.reason ?? 'user_request',
        status: 'new',
      },
    });
    const alert =
      existing ??
      (await this.alertRepo.save(
        this.alertRepo.create({
          tenantId: payload.tenantId ?? null,
          conversationId: payload.conversationId,
          sessionId: payload.sessionId ?? null,
          reason: payload.reason ?? 'user_request',
          preview: payload.preview?.slice(0, 300) ?? null,
          status: 'new',
        }),
      ));
    if (existing) return; // channels already notified for this escalation

    await Promise.allSettled([this.notifySlack(alert), this.notifyEmail(alert)]);
  }

  async list(status: string): Promise<AgentAlert[]> {
    return this.alertRepo.find({ where: { status }, order: { id: 'DESC' }, take: 50 });
  }

  async ack(id: number, userId: number): Promise<AgentAlert> {
    const alert = await this.alertRepo.findOne({ where: { id } });
    if (!alert) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (alert.status === 'new') {
      alert.status = 'acked';
      alert.ackedBy = userId;
      alert.ackedAt = new Date();
      await this.alertRepo.save(alert);
    }
    return alert;
  }

  // ---- channels ----

  private summary(alert: AgentAlert): string {
    const reason = REASON_LABEL[alert.reason] ?? alert.reason;
    const preview = alert.preview ? `\n> ${alert.preview}` : '';
    return `Chat escalation — conversation #${alert.conversationId}\nReason: ${reason}${preview}`;
  }

  /** Slack incoming webhook (SLACK_WEBHOOK_URL; empty = disabled). */
  private async notifySlack(alert: AgentAlert): Promise<void> {
    const url = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `:rotating_light: ${this.summary(alert)}` }),
      });
      if (!res.ok) this.logger.warn(`Slack alert failed: HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Slack alert failed: ${(e as Error).message}`);
    }
  }

  /**
   * SMTP email (SMTP_HOST/PORT/USER/PASS, ALERT_EMAIL_FROM/TO; empty =
   * disabled). nodemailer is loaded lazily so the API still boots and
   * typechecks when the dependency has not been installed yet.
   */
  private async notifyEmail(alert: AgentAlert): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const to = this.config.get<string>('ALERT_EMAIL_TO');
    if (!host || !to) return;
    try {
      const nodemailer = (await import('nodemailer' as string).catch(() => null)) as {
        createTransport: (opts: unknown) => { sendMail: (mail: unknown) => Promise<unknown> };
      } | null;
      if (!nodemailer) {
        this.logger.warn('Email alert skipped: nodemailer not installed (run npm install)');
        return;
      }
      const transport = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: Number(this.config.get<string>('SMTP_PORT') ?? 587) === 465,
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER'),
              pass: this.config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
      await transport.sendMail({
        from: this.config.get<string>('ALERT_EMAIL_FROM') ?? 'noreply@ivyusa.local',
        to,
        subject: `[IVY Chat] Escalation — conversation #${alert.conversationId}`,
        text: this.summary(alert),
      });
    } catch (e) {
      this.logger.warn(`Email alert failed: ${(e as Error).message}`);
    }
  }
}
