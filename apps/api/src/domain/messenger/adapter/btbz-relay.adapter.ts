import { Injectable, Logger } from '@nestjs/common';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { ChannelThread } from '../entity/channel-thread.entity';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { channelField } from '../messenger-secret.util';
import { ksrHeaders } from '../ksr-signature.util';
import {
  AdapterContext,
  MessengerAdapter,
  NormalizedInbound,
  SendResult,
  TEST_FAILURE_REASON,
  TestResult,
  ThreadCursor,
} from './messenger-adapter';
import {
  AdapterFailure,
  failedTest,
  loginFailure,
  unreachableFailure,
} from './adapter-failure.util';

const DEFAULT_BASE_URL = 'https://messenger.amoeba.site';
/** How the relay is named to operators — and what its account is called. */
const PROVIDER_LABEL = 'btbz relay';
/** The operator JWT lives 12h; refresh well before that (no refresh token exists). */
const TOKEN_TTL_SEC = 10 * 3600;
const WATERMARK_TTL_SEC = 7 * 24 * 3600;
const MESSAGE_LIMIT = 100;

/** Cold start ingests at most this many provider pages per pull (resumes next tick). */
const MAX_PROVIDER_PAGES = 20;
/** Channel-level provider cursor survives restarts; re-ingest is dedup-safe anyway. */
const PROVIDER_CURSOR_TTL_SEC = 30 * 24 * 3600;

/** relay_channel.channel_type → the short name the console badges. */
const SUB_CHANNEL: Record<string, string> = {
  relay_kakao_pc: 'kakao',
  relay_sms: 'sms',
};

/**
 * Provider-API `origin` → console badge. Origins are open-ended
 * ('relay_kakao_pc', 'line_android_notification', 'sms'…), so substring
 * matching beats a closed map: an unknown origin stays visible as 'relay'
 * instead of silently borrowing another channel's badge.
 */
function subChannelFromOrigin(origin: string | null | undefined): string {
  const o = (origin ?? '').toLowerCase();
  if (o.includes('kakao')) return 'kakao';
  if (o.includes('sms')) return 'sms';
  if (o.includes('line')) return 'line';
  return 'relay';
}

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

// ---- provider API v1 shapes (camelCase — unlike the operator inbox API) ----

interface ProviderInstance {
  instanceId?: string;
  customerRef?: string;
  relayState?: string;
  capabilities?: string[];
}

interface ProviderConversation {
  conversationId?: number;
  origin?: string | null;
  counterpartDisplay?: string | null;
  replyEnabled?: boolean;
  customerRef?: string;
}

interface ProviderMessage {
  messageId?: number;
  conversationId?: number;
  origin?: string;
  direction?: string;
  senderName?: string | null;
  senderNumber?: string | null;
  body?: string | null;
  bodyType?: string;
  occurredAt?: string;
  customerRef?: string;
}

interface ProviderPage<T> {
  data?: T[];
  nextCursor?: number | null;
  hasMore?: boolean;
  /** History was purged before the cursor — a recorded gap, not a silence. */
  truncated?: boolean;
}

interface ProviderCommand {
  status?: string;
  failReason?: string | null;
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
    if (this.signed(ctx)) return this.testSigned(ctx);
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
        accountId: this.fields(ctx).email || null,
      };
    } catch (e) {
      return failedTest(e);
    }
  }

  /**
   * Signed mode (PLN-260814 S2): the provider `instance` call verifies key,
   * signature AND — when expected_customer is set — that this base_url points
   * at the customer the operator believes it does (E5101 on mismatch, checked
   * server-side before anything is returned). Replies still ride the operator
   * account (D1a hybrid), so a configured reply path is probed too: reads
   * working while replies silently cannot log in is exactly the half-broken
   * state an operator needs named.
   */
  private async testSigned(ctx: AdapterContext): Promise<TestResult> {
    const provider = this.providerFields(ctx);
    let instance: ProviderInstance;
    try {
      instance = await this.providerGetData<ProviderInstance>(
        ctx,
        '/api/provider/v1/instance',
        provider.expectedCustomer ? { 'X-KSR-Expected-Customer': provider.expectedCustomer } : {},
      );
    } catch (e) {
      return failedTest(e);
    }

    let detail =
      `provider api connected (customer ${instance.customerRef ?? '?'}, ` +
      `relay ${instance.relayState ?? '?'})`;
    const operator = this.fields(ctx);
    if (operator.email && operator.password) {
      try {
        await this.token(ctx, true);
        detail += '; reply path ok';
      } catch (e) {
        return failedTest(e, `${detail}; reply path FAILED: ${(e as Error).message}`);
      }
    } else {
      detail += '; no operator account — replies disabled';
    }
    return { ok: true, detail, accountId: provider.keyId };
  }

  async pull(ctx: AdapterContext, cursors: ThreadCursor[]): Promise<NormalizedInbound[]> {
    if (this.signed(ctx)) return this.pullSigned(ctx);
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
   * Signed-mode pull: one channel-level incremental cursor over
   * `GET /messages?since_id=` (insertion-order id) replaces the legacy
   * conversation-list-plus-watermark walk — no N+1, no timestamp parsing.
   * Thread metadata (display name, reply_enabled) is fetched once per distinct
   * conversation in the batch. A lost cursor only re-ingests: the pipeline
   * dedups on (thread, externalMessageId).
   */
  private async pullSigned(ctx: AdapterContext): Promise<NormalizedInbound[]> {
    const expected = this.providerFields(ctx).expectedCustomer;
    const cursorKey = `ksr:pcursor:${ctx.channel.id}`;
    let since = Number((await this.redis.get(cursorKey)) ?? 0);
    if (!Number.isFinite(since) || since < 0) since = 0;

    const out: NormalizedInbound[] = [];
    const convCache = new Map<number, ProviderConversation | null>();

    for (let page = 0; page < MAX_PROVIDER_PAGES; page++) {
      const batch = await this.providerGetPage<ProviderMessage>(
        ctx,
        `/api/provider/v1/messages?since_id=${since}&direction=inbound&limit=${MESSAGE_LIMIT}`,
      );
      if (batch.truncated) {
        // History was purged past our cursor — a gap to record, not to hide.
        this.logger.warn(
          `ksr provider history truncated before cursor ${since} (channel ${ctx.channel.id})`,
        );
      }

      for (const msg of batch.data ?? []) {
        if (msg.messageId == null || msg.conversationId == null) continue;
        // The server already filtered direction=inbound; keep the guard anyway —
        // ingesting our own relayed replies would loop them back to customers.
        if ((msg.direction ?? '').toLowerCase() !== 'inbound') continue;
        // Every provider row carries the instance's customerRef (FR-052): a
        // mismatch means this base_url serves someone else's mall — stop before
        // storing anything against the wrong tenant.
        if (expected && msg.customerRef && msg.customerRef !== expected) {
          throw new Error(
            `ksr provider customerRef '${msg.customerRef}' != expected '${expected}' — ` +
              `channel ${ctx.channel.id} points at the wrong instance; pull aborted`,
          );
        }
        const text = (msg.body ?? '').trim();
        if (!text) continue;

        let conv = convCache.get(msg.conversationId);
        if (conv === undefined) {
          conv = await this.conversationMeta(ctx, msg.conversationId);
          convCache.set(msg.conversationId, conv);
        }

        out.push({
          externalThreadId: String(msg.conversationId),
          externalMessageId: String(msg.messageId),
          // Masked by the relay per consumer policy; SMS identity is the number.
          externalUserId: msg.senderNumber ?? null,
          externalUserName: msg.senderName ?? conv?.counterpartDisplay ?? null,
          text,
          languageHint: null,
          subChannel: subChannelFromOrigin(msg.origin ?? conv?.origin),
          replyEnabled: conv?.replyEnabled ?? true,
          occurredAt: parseDate(msg.occurredAt),
        });
      }

      if (batch.nextCursor != null && Number(batch.nextCursor) > since) {
        since = Number(batch.nextCursor);
      }
      if (!batch.hasMore) break;
      if (page === MAX_PROVIDER_PAGES - 1) {
        this.logger.warn(
          `ksr provider pull capped at ${MAX_PROVIDER_PAGES} pages (channel ${ctx.channel.id}); resuming next tick`,
        );
      }
    }

    await this.redis.set(cursorKey, String(since), PROVIDER_CURSOR_TTL_SEC);
    return out;
  }

  /** Single conversation's metadata; null (not a throw) keeps one bad row from killing the batch. */
  private async conversationMeta(
    ctx: AdapterContext,
    conversationId: number,
  ): Promise<ProviderConversation | null> {
    try {
      return await this.providerGetData<ProviderConversation>(
        ctx,
        `/api/provider/v1/conversations/${conversationId}`,
      );
    } catch (e) {
      this.logger.warn(`ksr conversation ${conversationId} meta fetch failed: ${(e as Error).message}`);
      return null;
    }
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
    if (this.signed(ctx)) {
      // Provider surface has the single-command lookup the operator API lacks.
      let command: ProviderCommand;
      try {
        command = await this.providerGetData<ProviderCommand>(
          ctx,
          `/api/provider/v1/commands/${encodeURIComponent(externalCommandId)}`,
        );
      } catch (e) {
        // A command the relay no longer knows (E5103 / TTL sweep) is not a success.
        if ((e as Error).message.includes('404')) return 'failed';
        throw e;
      }
      return mapCommandStatus(command.status);
    }
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
    return mapCommandStatus(command.status);
  }

  // ---- provider API v1 (signed mode, PLN-260814) ----

  /** key_id + api_secret both set = reads go through the signed provider API. */
  private signed(ctx: AdapterContext): boolean {
    const { keyId, apiSecret } = this.providerFields(ctx);
    return !!keyId && !!apiSecret;
  }

  private providerFields(ctx: AdapterContext): {
    keyId: string;
    apiSecret: string;
    expectedCustomer: string;
  } {
    return {
      keyId: channelField(ctx.channel, 'key_id'),
      apiSecret: channelField(ctx.channel, 'api_secret', { secret: true }),
      expectedCustomer: channelField(ctx.channel, 'expected_customer'),
    };
  }

  /** Signed GET returning the envelope's `data`. */
  private async providerGetData<T>(
    ctx: AdapterContext,
    pathWithQuery: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const envelope = await this.providerFetch<{ data?: T }>(ctx, pathWithQuery, extraHeaders);
    return (envelope.data ?? {}) as T;
  }

  /** Signed GET returning the whole page envelope (data + nextCursor/hasMore/truncated). */
  private async providerGetPage<T>(
    ctx: AdapterContext,
    pathWithQuery: string,
  ): Promise<ProviderPage<T>> {
    return this.providerFetch<ProviderPage<T>>(ctx, pathWithQuery);
  }

  /**
   * One signed request. Headers are minted here, per call — a retry re-enters
   * this method and re-signs, because replaying a (timestamp, nonce) pair is a
   * 409 to the server even when the first attempt died on the wire.
   */
  private async providerFetch<T>(
    ctx: AdapterContext,
    pathWithQuery: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const { keyId, apiSecret } = this.providerFields(ctx);
    const base = this.baseUrl(ctx.channel);
    let res: Response;
    try {
      res = await fetch(`${base}${pathWithQuery}`, {
        method: 'GET',
        // Signed over the path AS SENT (incl. /api/provider/v1 and query order) —
        // the server verifies req.originalUrl, so the URL string here and the one
        // in the signature must be the same value, never rebuilt separately.
        headers: { ...ksrHeaders(keyId, apiSecret, 'GET', pathWithQuery), ...extraHeaders },
      });
    } catch (e) {
      throw unreachableFailure(PROVIDER_LABEL, base, e);
    }
    const text = await res.text();
    let parsed: { error?: { code?: string; message?: string } } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON body — the status carries the story */
    }
    if (!res.ok) {
      const code = parsed.error?.code ?? '';
      const message = parsed.error?.message ?? '';
      // The auth ladder, named for operators: key problems are fixable in the
      // relay console, skew is fixable on the clock, binding on the base_url.
      if (code === 'E1101' || code === 'E1102' || code === 'E1103') {
        throw new AdapterFailure(
          TEST_FAILURE_REASON.CREDENTIALS,
          `${PROVIDER_LABEL} rejected the API key (${code}) at ${base} — check key id / secret`,
        );
      }
      if (code === 'E1104') {
        throw new Error(
          `${PROVIDER_LABEL} rejected the request clock (E1104): server/relay time differ by >300s`,
        );
      }
      if (code === 'E5101') {
        throw new Error(
          `${PROVIDER_LABEL} instance serves a different customer (E5101) — check base_url / expected customer`,
        );
      }
      if (code === 'E5109') {
        throw new Error(
          `${PROVIDER_LABEL} has not enabled provider delivery for this consumer (E5109) — enable it in the relay console`,
        );
      }
      throw new Error(
        `${PROVIDER_LABEL} GET ${pathWithQuery.split('?')[0]} failed: ${res.status}` +
          (code ? ` ${code}` : '') +
          (message ? ` ${message}` : ''),
      );
    }
    return parsed as T;
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
    // Posting an empty body would come back as a plain 401 and read as "wrong
    // password" — say which side is actually missing.
    if (!fields.email || !fields.password) {
      throw new AdapterFailure(
        TEST_FAILURE_REASON.CREDENTIALS,
        'btbz relay account email or password is not set',
      );
    }
    const loginUrl = `${this.baseUrl(ctx.channel)}/api/auth/login`;
    let res: Response;
    try {
      res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fields.email, password: fields.password }),
      });
    } catch (e) {
      // No answer at all — a wrong host or a down server. Distinct from any
      // status the relay could return, and the operator fixes it elsewhere.
      throw unreachableFailure(PROVIDER_LABEL, this.baseUrl(ctx.channel), e);
    }
    if (!res.ok) {
      // Name the URL and the case: 401 is a wrong operator account (the relay
      // is answering), 404 is a wrong server URL. One message for both sent
      // operators after the network instead of the account (FIX-260813).
      throw loginFailure(PROVIDER_LABEL, res.status, loginUrl);
    }

    const token = extractCookieToken(res.headers.get('set-cookie'));
    if (!token) throw new Error('btbz relay login returned no ksr_token cookie');
    await this.redis.set(key, token, TOKEN_TTL_SEC);
    return token;
  }

  private fields(ctx: AdapterContext): { email: string; password: string } {
    return {
      email: channelField(ctx.channel, 'email'),
      password: channelField(ctx.channel, 'password', { secret: true }),
    };
  }

  /**
   * Server URL, normalized. An operator pastes what they see in the browser, so
   * a missing scheme is added and a trailing path is kept — the error message
   * carries the full URL, which is how a wrong one gets spotted.
   */
  private baseUrl(channel: MessengerChannel): string {
    const raw = channelField(channel, 'base_url') || DEFAULT_BASE_URL;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withScheme.replace(/\/+$/, '');
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
        `btbz relay ${method} ${this.baseUrl(ctx.channel)}${path.split('?')[0]} failed: ${res.status}` +
          (message ? ` ${message}` : ''),
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

/** Relay command status → outbox delivery state (shared by both API surfaces). */
function mapCommandStatus(status: string | undefined): 'sent' | 'unconfirmed' | 'failed' | 'pending' {
  switch ((status ?? '').toUpperCase()) {
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

function truthy(value: boolean | number | undefined): boolean {
  // Postgres booleans arrive as true/false, but a numeric 1/0 must work too.
  return value === true || value === 1;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}
