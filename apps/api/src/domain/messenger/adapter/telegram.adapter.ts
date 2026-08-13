import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { BusinessException } from '../../../global/exception/business.exception';
import { ERROR_CODE } from '../../../global/constant/error-code.constant';
import { ChannelThread } from '../entity/channel-thread.entity';
import {
  AdapterContext,
  MessengerAdapter,
  NormalizedInbound,
  SendResult,
  TEST_FAILURE_REASON,
  TestResult,
} from './messenger-adapter';
import { failedTest } from './adapter-failure.util';

const API_BASE = 'https://api.telegram.org';
/** Telegram truncates beyond this; split rather than lose the tail. */
const MAX_TEXT = 4096;

interface TelegramUser {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramMessage {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: { id?: number; title?: string; type?: string };
  from?: TelegramUser;
}

/**
 * Telegram Bot API adapter (PLN-260810 PR-M1).
 *
 * Chosen as the first direct channel because it needs no platform review: a
 * BotFather token and an HTTPS receive URL are the whole setup, so the shared
 * pipeline gets a real end-to-end round trip on day one.
 */
@Injectable()
export class TelegramAdapter implements MessengerAdapter {
  readonly provider = MESSENGER_PROVIDER.TELEGRAM;
  readonly kind = 'webhook' as const;
  private readonly logger = new Logger(TelegramAdapter.name);

  private async call<T>(token: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const parsed = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || parsed.ok !== true) {
      // Never log the token — it lives in the URL, so log the method only.
      throw new Error(`telegram ${method} failed: ${res.status} ${parsed.description ?? ''}`.trim());
    }
    return parsed.result as T;
  }

  async test(ctx: AdapterContext): Promise<TestResult> {
    if (!ctx.secret) {
      return { ok: false, detail: 'bot token not set', reason: TEST_FAILURE_REASON.CREDENTIALS };
    }
    try {
      const me = await this.call<{ username?: string; first_name?: string }>(ctx.secret, 'getMe');
      const handle = me.username ? `@${me.username}` : (me.first_name ?? 'bot');
      return { ok: true, detail: `connected as ${handle}`, accountId: handle };
    } catch (e) {
      return failedTest(e);
    }
  }

  /** Point Telegram at our receive URL and pin the shared secret header to it. */
  async register(ctx: AdapterContext, webhookUrl: string): Promise<void> {
    await this.call(ctx.secret, 'setWebhook', {
      url: webhookUrl,
      secret_token: ctx.channel.webhookToken,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });
  }

  parse(ctx: AdapterContext, headers: Record<string, string>, raw: Buffer): NormalizedInbound[] {
    this.assertSecretToken(ctx, headers['x-telegram-bot-api-secret-token']);

    let update: { message?: TelegramMessage; edited_message?: TelegramMessage };
    try {
      update = JSON.parse(raw.toString('utf8'));
    } catch {
      // A malformed body is not an auth failure — swallow it as "nothing to do"
      // so Telegram stops redelivering a payload we can never parse.
      this.logger.warn(`telegram webhook: unparseable body (channel ${ctx.channel.id})`);
      return [];
    }

    // Edited messages are ignored on purpose: re-ingesting them would restate a
    // question the AI already answered.
    const msg = update.message;
    const text = (msg?.text ?? msg?.caption ?? '').trim();
    const chatId = msg?.chat?.id;
    if (!msg?.message_id || chatId == null || !text) return [];
    // Loop prevention #1 — never ingest another bot's (or our own) traffic.
    if (msg.from?.is_bot) return [];

    const from = msg.from;
    const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
    return [
      {
        externalThreadId: String(chatId),
        externalMessageId: String(msg.message_id),
        externalUserId: from?.id != null ? String(from.id) : null,
        externalUserName: name || from?.username || msg.chat?.title || null,
        text,
        languageHint: from?.language_code ?? null,
        subChannel: null,
        replyEnabled: true,
        occurredAt: msg.date ? new Date(msg.date * 1000) : null,
      },
    ];
  }

  async send(ctx: AdapterContext, thread: ChannelThread, text: string): Promise<SendResult> {
    const chunks = splitText(text, MAX_TEXT);
    let last = '';
    for (const chunk of chunks) {
      const sent = await this.call<{ message_id?: number }>(ctx.secret, 'sendMessage', {
        chat_id: thread.externalThreadId,
        text: chunk,
        disable_web_page_preview: true,
      });
      last = String(sent.message_id ?? '');
    }
    return { externalMessageId: last };
  }

  /**
   * Constant-time compare of the header Telegram echoes back. Fails CLOSED —
   * a channel with no token configured accepts nothing.
   */
  private assertSecretToken(ctx: AdapterContext, provided: string | undefined): void {
    const expected = ctx.channel.webhookToken ?? '';
    const a = Buffer.from(provided ?? '');
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(`telegram webhook rejected: bad secret token (channel ${ctx.channel.id})`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
  }
}

/** Split on the last newline/space before the limit so words survive. */
export function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const at = cut > limit * 0.5 ? cut : limit;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}
