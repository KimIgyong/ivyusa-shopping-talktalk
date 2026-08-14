import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { BusinessException } from '../../../global/exception/business.exception';
import { ERROR_CODE } from '../../../global/constant/error-code.constant';
import { ChannelThread } from '../entity/channel-thread.entity';
import {
  AdapterContext,
  InboundAttachmentRef,
  MessengerAdapter,
  NormalizedInbound,
  OutboundAttachment,
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

interface TelegramFile {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: { id?: number; title?: string; type?: string };
  from?: TelegramUser;
  /** Ascending sizes of the same picture — the last entry is the original. */
  photo?: TelegramFile[];
  document?: TelegramFile;
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
    // Files are a message too (PLN-260814 S5). A photo with no caption used to
    // be dropped here: the customer saw it sent, the agent never saw it arrive.
    const attachments = attachmentsOf(msg);
    if (!msg?.message_id || chatId == null || (!text && !attachments.length)) return [];
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
        attachments: attachments.length ? attachments : undefined,
      },
    ];
  }

  async send(
    ctx: AdapterContext,
    thread: ChannelThread,
    text: string,
    attachments?: OutboundAttachment[],
  ): Promise<SendResult> {
    let last = '';
    // Text first so the caption-less files arrive under it in reading order.
    if (text.trim()) {
      for (const chunk of splitText(text, MAX_TEXT)) {
        const sent = await this.call<{ message_id?: number }>(ctx.secret, 'sendMessage', {
          chat_id: thread.externalThreadId,
          text: chunk,
          disable_web_page_preview: true,
        });
        last = String(sent.message_id ?? '');
      }
    }
    for (const file of attachments ?? []) {
      // Telegram fetches the URL itself, which is why the link must be
      // absolute and still valid when their servers pull it.
      const isImage = file.kind === 'image';
      const sent = await this.call<{ message_id?: number }>(
        ctx.secret,
        isImage ? 'sendPhoto' : 'sendDocument',
        isImage
          ? { chat_id: thread.externalThreadId, photo: file.url }
          : { chat_id: thread.externalThreadId, document: file.url },
      );
      last = String(sent.message_id ?? '');
    }
    return { externalMessageId: last };
  }

  readonly supportsAttachments = true;

  /**
   * Telegram hands out a file id, not a URL: getFile resolves it to a path that
   * is then fetched from the bot-scoped file host. The token appears in that
   * URL, so it is never logged.
   */
  async downloadAttachment(
    ctx: AdapterContext,
    ref: InboundAttachmentRef,
  ): Promise<{ buffer: Buffer; filename: string; mime?: string | null } | null> {
    if (!ref.fileId) return null;
    const info = await this.call<{ file_path?: string }>(ctx.secret, 'getFile', {
      file_id: ref.fileId,
    });
    if (!info.file_path) return null;
    const res = await fetch(`${API_BASE}/file/bot${ctx.secret}/${info.file_path}`);
    if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    // Photos arrive without a name; the path's extension is what makes the
    // stored file recognisable as an image.
    const fallback = info.file_path.split('/').pop() || 'file';
    return { buffer, filename: ref.filename || fallback, mime: ref.mime ?? null };
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

/**
 * Photos and documents on one update. Telegram sends a photo as an array of
 * rescaled copies — the last is the original, and the only one worth keeping.
 */
function attachmentsOf(msg: TelegramMessage | undefined): InboundAttachmentRef[] {
  const refs: InboundAttachmentRef[] = [];
  const photo = msg?.photo?.length ? msg.photo[msg.photo.length - 1] : null;
  if (photo?.file_id) {
    refs.push({ fileId: photo.file_id, filename: null, mime: 'image/jpeg', size: photo.file_size ?? null });
  }
  if (msg?.document?.file_id) {
    refs.push({
      fileId: msg.document.file_id,
      filename: msg.document.file_name ?? null,
      mime: msg.document.mime_type ?? null,
      size: msg.document.file_size ?? null,
    });
  }
  return refs;
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
