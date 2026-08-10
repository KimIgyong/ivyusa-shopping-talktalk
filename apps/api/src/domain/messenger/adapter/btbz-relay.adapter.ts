import { Injectable, Logger } from '@nestjs/common';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { ChannelThread } from '../entity/channel-thread.entity';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { decryptChannelSecretFields } from '../messenger-secret.util';
import {
  AdapterContext,
  MessengerAdapter,
  NormalizedInbound,
  SendResult,
  TestResult,
  ThreadCursor,
} from './messenger-adapter';

const DEFAULT_BASE_URL = 'https://messenger.amoeba.site';
/** The operator JWT lives 12h; refresh well before that (no refresh token exists). */
const TOKEN_TTL_SEC = 10 * 3600;
const WATERMARK_TTL_SEC = 7 * 24 * 3600;
const MESSAGE_LIMIT = 100;

/** relay_channel.channel_type → the short name the console badges. */
const SUB_CHANNEL: Record<string, string> = {
  relay_kakao_pc: 'kakao',
  relay_sms: 'sms',
};

interface RelayConversation {
  id?: number;
  channel_type?: string;
  is_unofficial?: boolean | number;
  counterpart_display?: string;
  is_group_chat?: boolean | number;
  reply_enabled?: boolean | number;
  last_message_at?: string;
}

interface RelayMessage {
  id?: number;
  source_type?: string;
  direction?: string;
  sender_name?: string;
  sender_number?: string;
  body?: string;
  body_type?: string;
  occurred_at?: string;
}

interface RelayCommand {
  id?: number;
  status?: string;
  fail_reason?: string;
}

/**
 * btbz-messenger (KSR) relay adapter (PLN-260810 PR-M3).
 *
 * KSR bridges what no official API reaches: KakaoTalk personal/group rooms
 * (captured by the merchant's own Windows agent) and inbound SMS (their own
 * Android device). ShopTalk talks to it as an operator client — same polling
 * shape as the AmoebaTalk hub — with two properties the other channels lack:
 * SMS threads cannot be replied to, and a reply is a *command* handed to a
 * device, so delivery is never confirmed at send time (REQ §1.5, G12/G13).
 */
@Injectable()
export class BtbzRelayAdapter implements MessengerAdapter {
  readonly provider = MESSENGER_PROVIDER.BTBZ_RELAY;
  readonly kind = 'poll' as const;
  private readonly logger = new Logger(BtbzRelayAdapter.name);

  constructor(private readonly redis: RedisService) {}

  async test(ctx: AdapterContext): Promise<TestResult> {
    try {
      const token = await this.token(ctx, true);
      const list = await this.request<{ data?: RelayConversation[] }>(
        ctx,
        token,
        '/api/inbox/conversations',
        'GET',
      );
      const count = list?.data?.length ?? 0;
      return {
        ok: true,
        detail: `connected (${count} conversation(s))`,
        accountId: this.fields(ctx).email ?? null,
      };
    } catch (e) {
      return { ok: false, detail: (e as Error).message.slice(0, 200) };
    }
  }

  async pull(ctx: AdapterContext, cursors: ThreadCursor[]): Promise<NormalizedInbound[]> {
    const token = await this.token(ctx);
    const known = new Map(cursors.map((c) => [c.externalThreadId, c]));
    const list = await this.request<{ data?: RelayConversation[] }>(
      ctx,
      token,
      '/api/inbox/conversations',
      'GET',
    );

    const out: NormalizedInbound[] = [];
    for (const conv of list?.data ?? []) {
      const threadId = conv.id != null ? String(conv.id) : null;
      if (!threadId) continue;

      // Same reasoning as the AmoebaTalk hub: compare the timestamp STRING, not
      // a parsed Date — the relay's value carries no zone, and a naive parse
      // that lands in the past would silently skip an active room.
      const watermarkKey = `ksr:wm:${ctx.channel.id}:${threadId}`;
      const watermark = conv.last_message_at ?? null;
      if (watermark && known.has(threadId)) {
        const previous = await this.redis.get(watermarkKey);
        if (previous === watermark) continue;
      }

      const messages = await this.request<{ data?: RelayMessage[] }>(
        ctx,
        token,
        `/api/inbox/conversations/${threadId}/messages?limit=${MESSAGE_LIMIT}`,
        'GET',
      );
      const cursor = known.get(threadId)?.inboundCursor;
      const since = cursor != null ? Number(cursor) : 0;

      for (const msg of messages?.data ?? []) {
        if (msg.id == null) continue;
        // Loop prevention #1 — our own relayed replies come back as outbound.
        if ((msg.direction ?? '').toLowerCase() !== 'inbound') continue;
        if (Number.isFinite(since) && Number(msg.id) <= since) continue;
        const text = (msg.body ?? '').trim();
        if (!text) continue;

        out.push({
          externalThreadId: threadId,
          externalMessageId: String(msg.id),
          // KakaoTalk rooms have no stable user id here; the phone number is the
          // only identity SMS carries, and it is what the console shows.
          externalUserId: msg.sender_number ?? null,
          externalUserName: msg.sender_name ?? conv.counterpart_display ?? null,
          text,
          languageHint: null,
          subChannel: SUB_CHANNEL[conv.channel_type ?? ''] ?? 'relay',
          // SMS is receive-only: the relay rejects a reply with 400, so the
          // thread is marked here and the outbox never attempts a send.
          replyEnabled: truthy(conv.reply_enabled),
          occurredAt: parseDate(msg.occurred_at),
        });
      }

      if (watermark) await this.redis.set(watermarkKey, watermark, WATERMARK_TTL_SEC);
    }
    return out;
  }

  /**
   * A reply is queued as a command for the capturing device agent, so this
   * returns `unconfirmed`: the message left ShopTalk but nothing yet proves it
   * reached the room. `confirm` resolves it later.
   */
  async send(ctx: AdapterContext, thread: ChannelThread, text: string): Promise<SendResult> {
    const token = await this.token(ctx);
    const res = await this.request<{ data?: { command_id?: number; status?: string } }>(
      ctx,
      token,
      '/api/relay/replies',
      'POST',
      { conversation_id: Number(thread.externalThreadId), body: text },
    );
    const commandId = res?.data?.command_id;
    if (commandId == null) throw new Error('btbz relay accepted no command id');
    return { externalMessageId: String(commandId), unconfirmed: true };
  }

  async confirm(
    ctx: AdapterContext,
    thread: ChannelThread,
    externalCommandId: string,
  ): Promise<'sent' | 'unconfirmed' | 'failed' | 'pending'> {
    const token = await this.token(ctx);
    const res = await this.request<{ data?: RelayCommand[] }>(
      ctx,
      token,
      `/api/inbox/conversations/${thread.externalThreadId}/commands`,
      'GET',
    );
    const command = (res?.data ?? []).find((c) => String(c.id) === String(externalCommandId));
    // A command that vanished (TTL sweep) is not a success — treat it as failed.
    if (!command) return 'failed';

    switch ((command.status ?? '').toUpperCase()) {
      case 'SENT':
        return 'sent';
      case 'SENT_UNCONFIRMED':
        return 'unconfirmed';
      case 'FAILED':
        return 'failed';
      default:
        return 'pending'; // PENDING / DISPATCHED — the agent has not finished
    }
  }

  // ---- auth ----

  /**
   * The relay issues an operator JWT as an httpOnly cookie and also accepts it
   * as a Bearer token, so the cookie is read once and reused as Bearer. There
   * is no refresh token: an expired session is simply a fresh login.
   */
  private async token(ctx: AdapterContext, force = false): Promise<string> {
    const key = `ksr:token:${ctx.channel.id}`;
    if (!force) {
      const cached = await this.redis.get(key);
      if (cached) return cached;
    }

    const fields = this.fields(ctx);
    const res = await fetch(`${this.baseUrl(ctx.channel)}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fields.email, password: fields.password }),
    });
    if (!res.ok) throw new Error(`btbz relay login failed: ${res.status}`);

    const token = extractCookieToken(res.headers.get('set-cookie'));
    if (!token) throw new Error('btbz relay login returned no ksr_token cookie');
    await this.redis.set(key, token, TOKEN_TTL_SEC);
    return token;
  }

  private fields(ctx: AdapterContext): Record<string, string> {
    return decryptChannelSecretFields(ctx.channel);
  }

  private baseUrl(channel: MessengerChannel): string {
    const fromConfig = (channel.config?.base_url as string | undefined)?.trim();
    const fromSecret = decryptChannelSecretFields(channel).base_url?.trim();
    return (fromConfig || fromSecret || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private async request<T>(
    ctx: AdapterContext,
    token: string,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl(ctx.channel)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Cookie: `ksr_token=${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      // 400 on a reply means the room is receive-only or its agent is offline —
      // surfaced verbatim so the outbox can show the operator why.
      const message = (parsed as { message?: string })?.message;
      throw new Error(
        `btbz relay ${method} ${path.split('?')[0]} failed: ${res.status}${message ? ` ${message}` : ''}`,
      );
    }
    return parsed as T;
  }
}

/** Pull `ksr_token` out of a Set-Cookie header. */
export function extractCookieToken(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = /(?:^|[,;\s])ksr_token=([^;,\s]+)/.exec(setCookie);
  return match ? match[1] : null;
}

function truthy(value: boolean | number | undefined): boolean {
  // Postgres booleans arrive as true/false, but a numeric 1/0 must work too.
  return value === true || value === 1;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}
