import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { BusinessException } from '../../../global/exception/business.exception';
import { ERROR_CODE } from '../../../global/constant/error-code.constant';
import { ChannelThread } from '../entity/channel-thread.entity';
import {
  AdapterContext,
  MessengerAdapter,
  NormalizedInbound,
  OutboundAttachment,
  SendResult,
  TEST_FAILURE_REASON,
  TestResult,
} from './messenger-adapter';
import { failedTest } from './adapter-failure.util';
import { splitText } from './telegram.adapter';

const API_BASE = 'https://chatapi.viber.com/pa';
const MAX_TEXT = 7000;
/** Shown as the sender on outbound messages; Viber requires a name per send. */
const DEFAULT_SENDER_NAME = 'Support';

interface ViberEvent {
  event?: string;
  message_token?: number | string;
  timestamp?: number;
  sender?: { id?: string; name?: string; language?: string };
  message?: {
    type?: string;
    text?: string;
    /** Picture/file/video payloads carry a fetchable media URL. */
    media?: string;
    file_name?: string;
    size?: number;
  };
}

/**
 * Viber bot adapter (PLN-260810 PR-M1). Like Telegram it needs no platform
 * review — a public-account auth token is the whole credential, and that same
 * token is the HMAC key Viber signs deliveries with.
 */
@Injectable()
export class ViberAdapter implements MessengerAdapter {
  readonly provider = MESSENGER_PROVIDER.VIBER;
  readonly kind = 'webhook' as const;
  private readonly logger = new Logger(ViberAdapter.name);

  private async call<T>(token: string, path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Viber-Auth-Token': token },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => ({}))) as {
      status?: number;
      status_message?: string;
    } & Record<string, unknown>;
    // Viber answers 200 with status!=0 on failure — HTTP status alone is not proof.
    if (!res.ok || (parsed.status ?? -1) !== 0) {
      throw new Error(
        `viber ${path} failed: ${res.status} ${parsed.status_message ?? parsed.status ?? ''}`.trim(),
      );
    }
    return parsed as T;
  }

  async test(ctx: AdapterContext): Promise<TestResult> {
    if (!ctx.secret) {
      return { ok: false, detail: 'auth token not set', reason: TEST_FAILURE_REASON.CREDENTIALS };
    }
    try {
      const info = await this.call<{ uri?: string; name?: string }>(ctx.secret, 'get_account_info', {});
      const account = info.uri ? `@${info.uri}` : (info.name ?? 'account');
      return { ok: true, detail: `connected as ${account}`, accountId: account };
    } catch (e) {
      return failedTest(e);
    }
  }

  async register(ctx: AdapterContext, webhookUrl: string): Promise<void> {
    await this.call(ctx.secret, 'set_webhook', {
      url: webhookUrl,
      event_types: ['message', 'subscribed', 'unsubscribed', 'conversation_started'],
      send_name: true,
    });
  }

  parse(ctx: AdapterContext, headers: Record<string, string>, raw: Buffer): NormalizedInbound[] {
    this.assertSignature(ctx, headers['x-viber-content-signature'], raw);

    let evt: ViberEvent;
    try {
      evt = JSON.parse(raw.toString('utf8'));
    } catch {
      this.logger.warn(`viber webhook: unparseable body (channel ${ctx.channel.id})`);
      return [];
    }

    // 'conversation_started' carries no user message — replying to it would put
    // words in the shopper's mouth. Only real messages enter the pipeline.
    if (evt.event !== 'message') return [];
    const text = (evt.message?.text ?? '').trim();
    const senderId = evt.sender?.id;
    // A picture or file with no caption is still a message the agent must see
    // (PLN-260814 S5) — Viber hands us a fetchable media URL for both.
    const media = evt.message?.media
      ? [
          {
            url: evt.message.media,
            filename: evt.message.file_name ?? null,
            mime: evt.message.type === 'picture' ? 'image/jpeg' : null,
            size: evt.message.size ?? null,
          },
        ]
      : [];
    if ((!text && !media.length) || !senderId || evt.message_token == null) return [];

    return [
      {
        // Viber 1:1 conversations are keyed by the subscriber id.
        externalThreadId: senderId,
        externalMessageId: String(evt.message_token),
        externalUserId: senderId,
        externalUserName: evt.sender?.name ?? null,
        text,
        languageHint: evt.sender?.language ?? null,
        subChannel: null,
        replyEnabled: true,
        occurredAt: evt.timestamp ? new Date(evt.timestamp) : null,
        attachments: media.length ? media : undefined,
      },
    ];
  }

  readonly supportsAttachments = true;

  async send(
    ctx: AdapterContext,
    thread: ChannelThread,
    text: string,
    attachments?: OutboundAttachment[],
  ): Promise<SendResult> {
    let last = '';
    if (text.trim()) {
      for (const chunk of splitText(text, MAX_TEXT)) {
        const sent = await this.call<{ message_token?: number | string }>(ctx.secret, 'send_message', {
          receiver: thread.externalThreadId,
          min_api_version: 1,
          sender: { name: senderName(ctx) },
          type: 'text',
          text: chunk,
        });
        last = String(sent.message_token ?? '');
      }
    }
    for (const file of attachments ?? []) {
      // Viber pulls the media itself, so the link must be absolute and live.
      const isImage = file.kind === 'image';
      const sent = await this.call<{ message_token?: number | string }>(ctx.secret, 'send_message', {
        receiver: thread.externalThreadId,
        min_api_version: 1,
        sender: { name: senderName(ctx) },
        ...(isImage
          ? { type: 'picture', text: file.filename, media: file.url }
          : { type: 'file', media: file.url, file_name: file.filename, size: 0 }),
      });
      last = String(sent.message_token ?? '');
    }
    return { externalMessageId: last };
  }

  /**
   * X-Viber-Content-Signature = HMAC-SHA256(body, authToken) in hex. Fails
   * CLOSED: no token configured means no delivery is ever accepted.
   */
  private assertSignature(ctx: AdapterContext, provided: string | undefined, raw: Buffer): void {
    if (!ctx.secret) {
      this.logger.warn(`viber webhook rejected: no auth token (channel ${ctx.channel.id})`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
    const expected = createHmac('sha256', ctx.secret).update(raw).digest('hex');
    const a = Buffer.from((provided ?? '').toLowerCase());
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(`viber webhook rejected: bad signature (channel ${ctx.channel.id})`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.UNAUTHORIZED);
    }
  }
}

function senderName(ctx: AdapterContext): string {
  const configured = (ctx.channel.config?.sender_name as string | undefined)?.trim();
  return configured || DEFAULT_SENDER_NAME;
}
