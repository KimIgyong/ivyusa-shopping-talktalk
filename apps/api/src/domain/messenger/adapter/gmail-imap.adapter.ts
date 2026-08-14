import { Injectable, Logger } from '@nestjs/common';
import { MESSENGER_PROVIDER } from '@ivy/types';
import { ChannelThread } from '../entity/channel-thread.entity';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { channelField } from '../messenger-secret.util';
import {
  AdapterContext,
  MessengerAdapter,
  NormalizedInbound,
  OutboundAttachment,
  SendResult,
  TEST_FAILURE_REASON,
  TestResult,
  ThreadCursor,
} from './messenger-adapter';
import { failedTest } from './adapter-failure.util';
import { replySubject, stripQuotedReply, threadIdOf } from './mail-text.util';

const DEFAULT_IMAP_HOST = 'imap.gmail.com';
const DEFAULT_IMAP_PORT = 993;
const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 587;
/** Mails read per poll — a work mailbox burst must not stall the tick. */
const FETCH_LIMIT = 25;
/** How far back a first-time sync looks; older mail is history, not a chat. */
const FIRST_SYNC_HOURS = 24;

interface MailEnvelope {
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  date?: Date;
  from?: Array<{ name?: string; address?: string }>;
}

/**
 * Gmail work mailboxes over IMAP + SMTP (PLN-260810 PR-M4, decision D-2).
 *
 * The Gmail API's `gmail.modify` is a restricted scope — CASA security review
 * plus annual re-verification — while an app password works today, and AMA's
 * webmail module already proved this exact ImapFlow path in production. Each
 * row is one mailbox, so "업무용 1/2" are simply two channels.
 */
@Injectable()
export class GmailImapAdapter implements MessengerAdapter {
  readonly provider = MESSENGER_PROVIDER.GMAIL;
  readonly kind = 'poll' as const;
  private readonly logger = new Logger(GmailImapAdapter.name);

  async test(ctx: AdapterContext): Promise<TestResult> {
    const account = this.account(ctx);
    if (!account.email || !account.password) {
      return {
        ok: false,
        detail: 'mailbox address or app password not set',
        reason: TEST_FAILURE_REASON.CREDENTIALS,
      };
    }
    try {
      const client = await this.connect(ctx);
      try {
        const box = await client.mailboxOpen('INBOX', { readOnly: true });
        return {
          ok: true,
          detail: `connected (${(box as { exists?: number }).exists ?? 0} message(s) in INBOX)`,
          accountId: account.email,
        };
      } finally {
        await client.logout().catch(() => undefined);
      }
    } catch (e) {
      // ImapFlow says 'AUTHENTICATIONFAILED' in words, not a status code — the
      // classifier reads both, so a wrong app password stops reading as a
      // mail-server outage (FIX-260813).
      return failedTest(e, sanitize((e as Error).message));
    }
  }

  async pull(ctx: AdapterContext, cursors: ThreadCursor[]): Promise<NormalizedInbound[]> {
    const account = this.account(ctx);
    if (!account.email || !account.password) return [];

    const seen = new Set(cursors.map((c) => c.externalThreadId));
    const client = await this.connect(ctx);
    const out: NormalizedInbound[] = [];

    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        // UNSEEN, not "since the last poll": read state is the mailbox's own
        // cursor, survives restarts, and a human reading the mail in Gmail is a
        // deliberate opt-out of AI handling.
        const since = new Date(Date.now() - FIRST_SYNC_HOURS * 3600_000);
        const uids = (await client.search({ seen: false, since }, { uid: true })) || [];
        const recent = uids.slice(-FETCH_LIMIT);

        for (const uid of recent) {
          const message = await client.fetchOne(
            String(uid),
            { uid: true, envelope: true, headers: ['references'], source: true },
            { uid: true },
          );
          if (!message) continue;

          const envelope = (message.envelope ?? {}) as MailEnvelope;
          const from = envelope.from?.[0];
          const fromAddress = (from?.address ?? '').toLowerCase();
          // Loop prevention #1 — our own outbound reply lands in the same box.
          if (!fromAddress || fromAddress === account.email.toLowerCase()) continue;

          const source = message.source?.toString('utf8') ?? '';
          const references = readHeader(source, 'references');
          const threadId = threadIdOf({
            messageId: envelope.messageId ?? null,
            inReplyTo: envelope.inReplyTo ?? null,
            references,
          });
          const messageId = envelope.messageId ?? `uid:${uid}`;
          if (!threadId) continue;

          const text = stripQuotedReply(extractPlainText(source));
          // A mail whose whole content is a photo ("here's the damage") has no
          // body worth keeping — but it is still a message (PLN-260814 S5).
          const attachments = extractAttachments(source).map((a) => ({
            data: a.data,
            filename: a.filename,
            mime: a.mime,
            size: a.data.length,
          }));
          if (!text && !attachments.length) continue;

          out.push({
            externalThreadId: threadId,
            externalMessageId: messageId,
            externalUserId: fromAddress,
            externalUserName: from?.name || fromAddress,
            text: seen.has(threadId) ? text : withSubject(envelope.subject, text),
            languageHint: null,
            subChannel: 'email',
            replyEnabled: true,
            occurredAt: envelope.date ?? null,
            attachments: attachments.length ? attachments : undefined,
          });

          // Marked read only after it is queued for ingest, so a crash re-reads
          // the mail instead of dropping it.
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => undefined);
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return out;
  }

  /** Reply into the same mail thread (In-Reply-To/References), from the mailbox itself. */
  readonly supportsAttachments = true;

  async send(
    ctx: AdapterContext,
    thread: ChannelThread,
    text: string,
    attachments?: OutboundAttachment[],
  ): Promise<SendResult> {
    const account = this.account(ctx);
    if (!account.email || !account.password) throw new Error('gmail credential not set');
    if (!thread.externalUserId) throw new Error('gmail thread has no recipient address');

    const nodemailer = (await import('nodemailer' as string).catch(() => null)) as {
      createTransport: (opts: unknown) => {
        sendMail: (mail: unknown) => Promise<{ messageId?: string }>;
      };
    } | null;
    if (!nodemailer) throw new Error('nodemailer not installed');

    const port = Number(account.smtp_port || DEFAULT_SMTP_PORT);
    const transport = nodemailer.createTransport({
      host: account.smtp_host || DEFAULT_SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: account.email, pass: account.password },
    });

    // The last inbound Message-ID is the thread cursor, which is exactly what
    // In-Reply-To needs; the thread root keeps long threads stitched together.
    const inReplyTo = thread.inboundCursor ?? thread.externalThreadId;
    const sent = await transport.sendMail({
      from: `${(ctx.channel.config?.sender_name as string) || ctx.channel.label} <${account.email}>`,
      to: thread.externalUserId,
      subject: replySubject((ctx.channel.config?.subject as string) ?? thread.externalUserName ?? null),
      text,
      // nodemailer fetches each URL and embeds the bytes, so the mail carries
      // the real file rather than a link that expires before it is read.
      attachments: attachments?.length
        ? attachments.map((a) => ({ filename: a.filename, path: a.url }))
        : undefined,
      inReplyTo,
      references: [thread.externalThreadId, inReplyTo].filter(Boolean).join(' '),
    });
    return { externalMessageId: sent.messageId ?? `smtp:${Date.now()}` };
  }

  // ---- helpers ----

  private account(ctx: AdapterContext): {
    email: string;
    password: string;
    imap_host: string;
    smtp_host: string;
    imap_port: string;
    smtp_port: string;
  } {
    const channel = ctx.channel;
    return {
      email: channelField(channel, 'email'),
      password:
        channelField(channel, 'app_password', { secret: true }) ||
        channelField(channel, 'password', { secret: true }),
      imap_host: channelField(channel, 'imap_host'),
      smtp_host: channelField(channel, 'smtp_host'),
      imap_port: channelField(channel, 'imap_port'),
      smtp_port: channelField(channel, 'smtp_port'),
    };
  }

  private async connect(ctx: AdapterContext) {
    // Imported lazily: the API must still boot where the optional IMAP
    // dependency is absent (same rule as nodemailer in MailerService).
    const mod = (await import('imapflow' as string).catch(() => null)) as {
      ImapFlow: new (opts: unknown) => ImapClient;
    } | null;
    if (!mod) throw new Error('imapflow not installed');

    const account = this.account(ctx);
    const client = new mod.ImapFlow({
      host: account.imap_host || DEFAULT_IMAP_HOST,
      port: Number(account.imap_port || DEFAULT_IMAP_PORT),
      secure: true,
      auth: { user: account.email, pass: account.password },
      logger: false,
    });
    await client.connect();
    return client;
  }
}

/** The slice of ImapFlow this adapter uses (the package ships its own types). */
interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string, opts?: unknown): Promise<unknown>;
  getMailboxLock(path: string): Promise<{ release: () => void }>;
  search(query: unknown, opts?: unknown): Promise<number[]>;
  fetchOne(
    range: string,
    query: unknown,
    opts?: unknown,
  ): Promise<{ envelope?: unknown; source?: Buffer } | undefined>;
  messageFlagsAdd(range: string, flags: string[], opts?: unknown): Promise<boolean>;
}

/** First `text/plain` part of a raw MIME message, decoded well enough to read. */
export function extractPlainText(source: string): string {
  if (!source) return '';
  const normalized = source.replace(/\r\n/g, '\n');
  const boundaryMatch = /boundary="?([^"\n;]+)"?/i.exec(normalized);

  if (boundaryMatch) {
    const parts = normalized.split(`--${boundaryMatch[1]}`);
    for (const part of parts) {
      if (!/content-type:\s*text\/plain/i.test(part)) continue;
      return decodePart(part);
    }
    // Multipart with no plain alternative — fall through to the whole body.
  }
  const split = normalized.indexOf('\n\n');
  const headers = split >= 0 ? normalized.slice(0, split) : '';
  const body = split >= 0 ? normalized.slice(split + 2) : normalized;
  return decodeBody(body, headers);
}

/**
 * Attachments on a raw MIME message (PLN-260814 S5).
 *
 * Only parts that name a file are taken: an inline `text/html` alternative has
 * no filename and is the body, not an attachment. Base64 is the encoding
 * essentially every mail client uses for binaries; a part encoded otherwise is
 * skipped rather than stored as bytes we cannot trust to be intact.
 */
export function extractAttachments(
  source: string,
  max = 5,
): { filename: string; mime: string | null; data: Buffer }[] {
  if (!source) return [];
  const normalized = source.replace(/\r\n/g, '\n');
  const boundaryMatch = /boundary="?([^"\n;]+)"?/i.exec(normalized);
  if (!boundaryMatch) return [];

  const out: { filename: string; mime: string | null; data: Buffer }[] = [];
  for (const part of normalized.split(`--${boundaryMatch[1]}`)) {
    if (out.length >= max) break;
    const split = part.indexOf('\n\n');
    if (split < 0) continue;
    const headers = part.slice(0, split);
    const filename =
      /filename\*?=(?:"([^"]+)"|([^\s;]+))/i.exec(headers)?.slice(1).find(Boolean) ??
      /name\*?=(?:"([^"]+)"|([^\s;]+))/i.exec(headers)?.slice(1).find(Boolean);
    if (!filename) continue;
    if (!/content-transfer-encoding:\s*base64/i.test(headers)) continue;

    const mime = /content-type:\s*([\w.+-]+\/[\w.+-]+)/i.exec(headers)?.[1] ?? null;
    try {
      const data = Buffer.from(part.slice(split + 2).replace(/\s+/g, ''), 'base64');
      if (data.length) out.push({ filename: filename.trim(), mime, data });
    } catch {
      // A part we cannot decode is dropped; the message body still arrives.
    }
  }
  return out;
}

function decodePart(part: string): string {
  const split = part.indexOf('\n\n');
  if (split < 0) return '';
  return decodeBody(part.slice(split + 2), part.slice(0, split));
}

function decodeBody(body: string, headers: string): string {
  const encoding = /content-transfer-encoding:\s*([\w-]+)/i.exec(headers)?.[1]?.toLowerCase();
  if (encoding === 'base64') {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return body;
    }
  }
  if (encoding === 'quoted-printable') return decodeQuotedPrintable(body);
  return body;
}

/**
 * Quoted-printable → UTF-8. Decoding `=XX` straight to a character yields
 * latin1 (`Café` arrives as `CafÃ©`, `배송` as mojibake), so the escapes are
 * collected as BYTES and the whole buffer is decoded once.
 */
function decodeQuotedPrintable(body: string): string {
  const unfolded = body.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i += 1) {
    const char = unfolded[i];
    const hex = unfolded.slice(i + 1, i + 3);
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
      continue;
    }
    const code = char.charCodeAt(0);
    // Raw non-ASCII is invalid QP but does occur; keep its own UTF-8 bytes.
    if (code > 127) bytes.push(...Buffer.from(char, 'utf8'));
    else bytes.push(code);
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Read one header out of a raw message (unfolding continuation lines). */
export function readHeader(source: string, name: string): string | null {
  if (!source) return null;
  const normalized = source.replace(/\r\n/g, '\n');
  const headerBlock = normalized.split('\n\n')[0] ?? '';
  const unfolded = headerBlock.replace(/\n[ \t]+/g, ' ');
  const match = new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(unfolded);
  return match ? match[1].trim() : null;
}

/** Keep the subject on the first turn — it is usually the actual question. */
function withSubject(subject: string | undefined, text: string): string {
  const clean = (subject ?? '').trim();
  if (!clean) return text;
  return `${clean}\n\n${text}`;
}

/** IMAP errors can echo the login; never let a credential reach a log or the UI. */
function sanitize(message: string): string {
  return message.replace(/AUTHENTICATE|LOGIN\s+\S+\s+\S+/gi, 'LOGIN ***').slice(0, 200);
}
