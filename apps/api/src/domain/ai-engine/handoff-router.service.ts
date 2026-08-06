import { Injectable } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import type { HandoffConfig } from './entity/tenant-ai-config.entity';

/** What the chat pipeline should do with one escalation (PLN-AiSetting W3). */
export interface HandoffRoute {
  /** 'agents' = page the console/Slack/email fan-out; 'email' = off-hours only. */
  mode: 'agents' | 'email';
  /** Agents to address the alert to. Empty = broadcast to everyone. */
  targetUserIds: number[];
  /** Mailbox for the off-hours summary (mode='email'), when configured. */
  email?: string;
  /** Customer-facing notice override for this route, if the tenant set one. */
  notice?: string;
}

/** Built-in off-hours wording (used when the tenant left the notice blank). */
const DEFAULT_OFF_HOURS_NOTICE: Record<string, string> = {
  EN: "We're outside our support hours right now. I've passed your message to our team — they'll reply by email as soon as they're back.",
  ES: 'Ahora mismo estamos fuera del horario de atención. He enviado tu mensaje al equipo y te responderán por correo en cuanto vuelvan.',
  KO: '지금은 상담 가능 시간이 아니에요. 남겨주신 내용은 담당자에게 전달했고, 업무 시간에 이메일로 회신드릴게요.',
};

/**
 * Decides who to notify on escalation and what to tell the customer.
 * Kept separate from AgentAlertService so the chat pipeline can pick the
 * customer-facing wording before the alert fan-out happens.
 */
@Injectable()
export class HandoffRouterService {
  constructor(private readonly aiConfig: AiConfigService) {}

  async route(tenantId: number | null, language: string): Promise<HandoffRoute> {
    const config = await this.aiConfig.getHandoffConfig(tenantId);
    const targetUserIds = config?.assigneeUserIds?.filter((id) => Number.isFinite(id)) ?? [];

    if (config?.businessHours && !this.withinBusinessHours(config.businessHours)) {
      const email = config.offHours?.email?.trim();
      // Off hours without a mailbox configured: nothing to hand the message to,
      // so fall back to paging agents rather than silently dropping the request.
      if (email) {
        return {
          mode: 'email',
          targetUserIds: [],
          email,
          notice: this.notice(config, language),
        };
      }
    }
    return { mode: 'agents', targetUserIds };
  }

  private notice(config: HandoffConfig, language: string): string {
    const lang = (language || 'EN').toUpperCase();
    const custom = config.offHours?.notice as Record<string, string> | undefined;
    return (
      custom?.[lang]?.trim() ||
      custom?.EN?.trim() ||
      DEFAULT_OFF_HOURS_NOTICE[lang] ||
      DEFAULT_OFF_HOURS_NOTICE.EN
    );
  }

  /**
   * Day + time-of-day check in the tenant's timezone. Public holidays are out
   * of scope (PLN §5-2) — weekday and clock only. An overnight window
   * (start > end, e.g. 22:00–06:00) is treated as spanning midnight.
   */
  private withinBusinessHours(hours: NonNullable<HandoffConfig['businessHours']>): boolean {
    const start = this.minutes(hours.start);
    const end = this.minutes(hours.end);
    if (start == null || end == null) return true; // malformed config → never block

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone || 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    // Intl renders midnight as '24' in some locales/engines — normalise to 0.
    const now = (Number(get('hour')) % 24) * 60 + Number(get('minute'));

    const days = hours.days?.length ? hours.days : [0, 1, 2, 3, 4, 5, 6];
    const onShift = (() => {
      if (start <= end) {
        return days.includes(dayIndex) && now >= start && now < end;
      }
      // Overnight window: the tail after midnight belongs to the previous day's shift.
      const prevDay = (dayIndex + 6) % 7;
      return (days.includes(dayIndex) && now >= start) || (days.includes(prevDay) && now < end);
    })();
    if (!onShift) return false;

    // Breaks (lunch, standup) carve holes in the shift: nobody is at the console,
    // so the shopper should get the email-reply route rather than a promise of a
    // live agent. A malformed entry is ignored, never treated as "closed".
    for (const b of hours.breaks ?? []) {
      const from = this.minutes(b?.start);
      const to = this.minutes(b?.end);
      if (from == null || to == null || from === to) continue;
      const inBreak = from < to ? now >= from && now < to : now >= from || now < to;
      if (inBreak) return false;
    }
    return true;
  }

  private minutes(hhmm: string | undefined): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
}
