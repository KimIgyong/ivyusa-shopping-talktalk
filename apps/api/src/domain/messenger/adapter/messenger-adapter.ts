import { MessengerChannel } from '../entity/messenger-channel.entity';
import { ChannelThread } from '../entity/channel-thread.entity';

/**
 * One inbound message, already stripped of provider shape. Everything the
 * ingest pipeline needs and nothing provider-specific — this is the seam that
 * lets a hub-routed channel become a direct one later without touching the
 * pipeline, the console or the stored data (PLN-260810 §1).
 */
export interface NormalizedInbound {
  /** Provider's conversation identity (chat id, room id, mail thread). */
  externalThreadId: string;
  /** Provider's message identity — the duplicate-delivery key. */
  externalMessageId: string;
  externalUserId: string | null;
  externalUserName: string | null;
  text: string;
  /** Locale hint from the platform profile, if it offers one ('ko', 'es-ES'…). */
  languageHint: string | null;
  /** Hub-internal channel (zalo|line|kakao|sms…); null for direct channels. */
  subChannel: string | null;
  /** False when the platform forbids replying to this thread (SMS relay). */
  replyEnabled: boolean;
  occurredAt: Date | null;
}

/** What a poll adapter already ingested for one external thread. */
export interface ThreadCursor {
  externalThreadId: string;
  /** Last external message id ingested, or null for a thread never polled. */
  inboundCursor: string | null;
  lastInboundAt: Date | null;
}

/** Adapter call context: the channel row plus its decrypted credential. */
export interface AdapterContext {
  channel: MessengerChannel;
  /** Decrypted secret (bot token / auth token / password). Empty when unset. */
  secret: string;
}

export interface SendResult {
  externalMessageId: string;
  /**
   * True when the provider accepted the message but cannot confirm delivery
   * (btbz relay hands it to a device agent). The outbox records `unconfirmed`
   * rather than claiming a delivery it cannot prove.
   */
  unconfirmed?: boolean;
}

/**
 * Why a credential check failed, in the only distinction an operator can act
 * on: fix the account, fix the URL, or wait for the other side.
 *
 * It exists because "connection failed" was the console's answer to all four.
 * A relay that answered 401 — reachable, credentials wrong — read as a dead
 * server, and the wrong thing got investigated (FIX-260813).
 */
export const TEST_FAILURE_REASON = {
  /** Reached the provider; it rejected the account (401/403). */
  CREDENTIALS: 'credentials',
  /** Reached a server, but not the provider's API — usually a wrong base URL. */
  NOT_FOUND: 'not_found',
  /** Never got an answer: DNS, TLS, refused connection, timeout. */
  UNREACHABLE: 'unreachable',
  /** The provider answered, and its answer was a failure of its own (5xx). */
  PROVIDER_ERROR: 'provider_error',
} as const;
export type TestFailureReason = (typeof TEST_FAILURE_REASON)[keyof typeof TEST_FAILURE_REASON];

export interface TestResult {
  ok: boolean;
  detail: string;
  /** Provider-side account identity to display on the card (@bot, OA name…). */
  accountId?: string | null;
  /**
   * Failure class for the console to localize. Optional: an adapter that
   * cannot tell the cases apart leaves it unset and the console falls back to
   * the plain "connection failed" copy rather than guessing.
   */
  reason?: TestFailureReason;
}

/**
 * The port every channel implementation plugs into. `webhook` adapters are
 * pushed to (they implement `parse`), `poll` adapters are pulled from (they
 * implement `pull`); both share `send` and `test`.
 */
export interface MessengerAdapter {
  readonly provider: string;
  readonly kind: 'webhook' | 'poll';

  /** Credential check for the console's "Test connection" button. Never throws. */
  test(ctx: AdapterContext): Promise<TestResult>;

  /**
   * Verify and normalize a webhook delivery. MUST throw when the signature or
   * shared secret does not match — the controller turns that into a 401.
   */
  parse?(ctx: AdapterContext, headers: Record<string, string>, raw: Buffer): NormalizedInbound[];

  /**
   * Fetch messages newer than what we already hold (poll adapters). Cursors are
   * passed in rather than read by the adapter, so database access stays in the
   * service layer and the adapter remains a pure protocol translator.
   */
  pull?(ctx: AdapterContext, cursors: ThreadCursor[]): Promise<NormalizedInbound[]>;

  send(ctx: AdapterContext, thread: ChannelThread, text: string): Promise<SendResult>;

  /** Register ShopTalk's receive URL with the provider on activation. */
  register?(ctx: AdapterContext, webhookUrl: string): Promise<void>;

  /** Resolve an asynchronous send (adapters whose `send` returns unconfirmed). */
  confirm?(
    ctx: AdapterContext,
    thread: ChannelThread,
    externalCommandId: string,
  ): Promise<'sent' | 'unconfirmed' | 'failed' | 'pending'>;
}
