import { Injectable, Logger } from '@nestjs/common';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { ChannelThread } from '../entity/channel-thread.entity';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { channelField } from '../messenger-secret.util';
import {
  AdapterContext,
  MessengerAdapter,
  NormalizedInbound,
  SendResult,
  TestResult,
  ThreadCursor,
} from './messenger-adapter';
import {
  failedTest,
  httpStatusOf,
  loginFailure,
  unreachableFailure,
} from './adapter-failure.util';

const DEFAULT_BASE_URL = 'https://api-talk.amoeba.site';
/** How the hub is named to operators — and what its account is called. */
const PROVIDER_LABEL = 'amoebatalk';
/** Conversations scanned per poll — the list is ordered by last activity. */
const CONVERSATION_PAGE = 20;
/** Messages read per changed conversation. */
const MESSAGE_PAGE = 50;
/** Access-token cache TTL. Short enough that a revoked login recovers quickly. */
const TOKEN_TTL_SEC = 30 * 60;
/** Per-conversation "nothing changed" marker; expiring it only costs a refetch. */
const WATERMARK_TTL_SEC = 7 * 24 * 3600;

/** AmoebaTalk marks an operator/bot message with user_type '1'. */
const USER_TYPE_CUSTOMER = '0';

interface InboxConversation {
  conversation_id?: number;
  customer_id?: number;
  customer_name?: string;
  last_message_time?: string;
  social_type?: string;
}

interface InboxMessage {
  id?: number;
  conversation_id?: number;
  customer_id?: number;
  content?: string;
  content_type?: string;
  user_type?: string;
  user_name?: string;
  created_at?: string;
  written_date?: string;
}

/**
 * AmoebaTalk hub adapter (PLN-260810 PR-M2).
 *
 * AmoebaTalk already carries Zalo, LINE, WhatsApp (and Facebook/KakaoTalk) with
 * the platform reviews cleared, so ShopTalk reaches those channels through its
 * Inbox API instead of re-certifying with each vendor. It exposes no outbound
 * webhook, hence polling; when one is added, only `pull` is replaced.
 */
@Injectable()
export class AmoebaTalkHubAdapter implements MessengerAdapter {
  readonly provider = MESSENGER_PROVIDER.AMOEBATALK;
  readonly kind = 'poll' as const;
  private readonly logger = new Logger(AmoebaTalkHubAdapter.name);

  constructor(private readonly redis: RedisService) {}

  async test(ctx: AdapterContext): Promise<TestResult> {
    try {
      const token = await this.accessToken(ctx, true);
      const list = await this.get<{ data?: { items?: InboxConversation[] } }>(
        ctx,
        token,
        `/api/inbox/conversations?page=1&limit=1`,
      );
      const count = list?.data?.items?.length ?? 0;
      const account = this.fields(ctx).email || null;
      return { ok: true, detail: `connected (${count} conversation(s) visible)`, accountId: account };
    } catch (e) {
      return failedTest(e);
    }
  }

  async pull(ctx: AdapterContext, cursors: ThreadCursor[]): Promise<NormalizedInbound[]> {
    const token = await this.accessToken(ctx);
    const byThread = new Map(cursors.map((c) => [c.externalThreadId, c]));
    const socialTypes = this.socialTypes(ctx);
    const out: NormalizedInbound[] = [];
    const seenThisPull = new Set<string>();

    // One list call per configured sub-channel; no filter = whatever the account sees.
    for (const socialType of socialTypes.length ? socialTypes : [null]) {
      const query = new URLSearchParams({ page: '1', limit: String(CONVERSATION_PAGE) });
      if (socialType) query.set('social_type', socialType);
      const list = await this.get<{ data?: { items?: InboxConversation[] } }>(
        ctx,
        token,
        `/api/inbox/conversations?${query.toString()}`,
      );

      for (const conv of list?.data?.items ?? []) {
        const threadId = conv.conversation_id != null ? String(conv.conversation_id) : null;
        if (!threadId) continue;

        if (seenThisPull.has(threadId)) continue; // same conversation via two social_type filters
        seenThisPull.add(threadId);

        // Skip conversations that have not moved since the last poll — the list
        // call is cheap, the per-conversation message fetch is not.
        //
        // The comparison is on the hub's own timestamp STRING, not a parsed
        // Date: 'YYYY-MM-DD HH:mm:ss' carries no zone, so parsing it and
        // comparing against our UTC cursor can place an active conversation in
        // the past and silently drop the shopper's message. An exact string
        // match cannot be wrong, and a missing watermark simply refetches.
        const known = byThread.get(threadId);
        const watermarkKey = `atk:wm:${ctx.channel.id}:${threadId}`;
        const watermark = conv.last_message_time ?? null;
        if (watermark && known) {
          const previous = await this.redis.get(watermarkKey);
          if (previous === watermark) continue;
        }

        const messages = await this.get<{ data?: { messages?: InboxMessage[] } }>(
          ctx,
          token,
          `/api/inbox/conversations/${threadId}/messages?page=1&limit=${MESSAGE_PAGE}`,
        );
        const cursor = known?.inboundCursor != null ? Number(known.inboundCursor) : 0;

        for (const msg of messages?.data?.messages ?? []) {
          if (msg.id == null) continue;
          // Loop prevention #1 — operator/bot turns (including our own replies).
          if (String(msg.user_type ?? '') !== USER_TYPE_CUSTOMER) continue;
          if (Number.isFinite(cursor) && Number(msg.id) <= cursor) continue;
          const text = (msg.content ?? '').trim();
          if (!text) continue;

          out.push({
            externalThreadId: threadId,
            externalMessageId: String(msg.id),
            externalUserId: conv.customer_id != null ? String(conv.customer_id) : null,
            externalUserName: conv.customer_name ?? msg.user_name ?? null,
            text,
            languageHint: null,
            // The hub's own channel name is what the console badge shows.
            subChannel: normalizeSocialType(conv.social_type ?? socialType),
            replyEnabled: true,
            occurredAt: parseDate(msg.created_at ?? msg.written_date),
          });
        }

        // Written only after the messages were read, so a crash mid-poll
        // re-reads the conversation instead of skipping it.
        if (watermark) await this.redis.set(watermarkKey, watermark, WATERMARK_TTL_SEC);
      }
    }
    return out;
  }

  async send(ctx: AdapterContext, thread: ChannelThread, text: string): Promise<SendResult> {
    const token = await this.accessToken(ctx);
    const res = await this.post<{ data?: { id?: number; message_id?: number } }>(
      ctx,
      token,
      `/api/inbox/conversations/${thread.externalThreadId}/messages`,
      { content: text },
    );
    const id = res?.data?.id ?? res?.data?.message_id;
    return { externalMessageId: id != null ? String(id) : '' };
  }

  // ---- auth ----

  /**
   * Two-step login (signin → select-company) cached in Redis. There is no
   * server-to-server API key, so a bot account's credentials are the only way
   * in; `force` re-logs in when a cached token turns out to be stale.
   */
  private async accessToken(ctx: AdapterContext, force = false): Promise<string> {
    const key = `atk:token:${ctx.channel.id}`;
    if (!force) {
      const cached = await this.redis.get(key);
      if (cached) return cached;
    }

    const fields = this.fields(ctx);
    const signinUrl = `${this.baseUrl(ctx.channel)}/api/auth/signin`;
    const signin = await this.post<{
      data?: { temp_token?: string; access_token?: string; companies?: Array<{ id?: number | string }> };
    }>(ctx, null, '/api/auth/signin', { email: fields.email, password: fields.password }).catch(
      (e: unknown) => {
        // Same trap as the relay's (FIX-260813): the hub answering 401 is a
        // wrong hub account, not a network problem, and the raw status alone
        // does not say so. No status at all means no answer was read — that
        // one really is the network.
        const status = httpStatusOf(e);
        throw status === null
          ? unreachableFailure(PROVIDER_LABEL, this.baseUrl(ctx.channel), e)
          : loginFailure(PROVIDER_LABEL, status, signinUrl);
      },
    );

    const tempToken = signin?.data?.temp_token;
    let accessToken = signin?.data?.access_token;

    if (!accessToken) {
      if (!tempToken) throw new Error('amoebatalk signin returned no token');
      // `fields.company_id` already prefers config over the encrypted blob;
      // with neither set, take the first workspace the account belongs to.
      const companyId = fields.company_id || signin?.data?.companies?.[0]?.id;
      const selected = await this.post<{ data?: { access_token?: string } }>(
        ctx,
        tempToken,
        '/api/auth/select-company',
        { company_id: companyId },
      );
      accessToken = selected?.data?.access_token;
    }
    if (!accessToken) throw new Error('amoebatalk select-company returned no access token');

    await this.redis.set(key, accessToken, TOKEN_TTL_SEC);
    return accessToken;
  }

  private fields(ctx: AdapterContext): { email: string; password: string; company_id: string } {
    return {
      email: channelField(ctx.channel, 'email'),
      password: channelField(ctx.channel, 'password', { secret: true }),
      company_id: channelField(ctx.channel, 'company_id'),
    };
  }

  private socialTypes(ctx: AdapterContext): string[] {
    const configured = ctx.channel.config?.social_types;
    return Array.isArray(configured) ? configured.map(String).filter(Boolean) : [];
  }

  private baseUrl(channel: MessengerChannel): string {
    const configured = (channel.config?.base_url as string | undefined)?.trim();
    return (configured || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private async get<T>(ctx: AdapterContext, token: string | null, path: string): Promise<T> {
    return this.request<T>(ctx, token, path, 'GET');
  }

  private async post<T>(
    ctx: AdapterContext,
    token: string | null,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.request<T>(ctx, token, path, 'POST', body);
  }

  private async request<T>(
    ctx: AdapterContext,
    token: string | null,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl(ctx.channel)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      // Never echo the body: it can carry customer message content.
      throw new Error(
        `amoebatalk ${method} ${this.baseUrl(ctx.channel)}${path.split('?')[0]} failed: ${res.status}`,
      );
    }
    return parsed as T;
  }
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  // The hub returns both ISO and 'YYYY-MM-DD HH:mm:ss'; the latter needs a 'T'.
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Hub social types map onto the short channel names the console badges use. */
export function normalizeSocialType(socialType: string | null | undefined): string | null {
  const value = (socialType ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'kakaotalk') return 'kakao';
  if (value === 'chatwidget') return 'widget';
  return value.slice(0, 16);
}
