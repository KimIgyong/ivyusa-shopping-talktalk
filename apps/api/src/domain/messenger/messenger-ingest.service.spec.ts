import { Repository } from 'typeorm';
import { MessengerIngestService } from './messenger-ingest.service';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { ChannelThread } from './entity/channel-thread.entity';
import { ChannelMessageMap } from './entity/channel-message-map.entity';
import { Session } from '../session/entity/session.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { ChatService } from '../chat/chat.service';
import { SessionService } from '../session/session.service';
import { MessengerOutboxService } from './messenger-outbox.service';
import { NormalizedInbound } from './adapter/messenger-adapter';

/**
 * Inbound pipeline (PLN-260810 PR-M1): duplicate suppression, consent recording
 * for channels with no banner, and the auto-reply on/off split.
 */
describe('MessengerIngestService', () => {
  const inbound: NormalizedInbound = {
    externalThreadId: 'chat-1',
    externalMessageId: 'ext-100',
    externalUserId: 'u-1',
    externalUserName: 'Gil',
    text: 'where is my order?',
    languageHint: 'ko',
    subChannel: null,
    replyEnabled: true,
    occurredAt: null,
  };

  function build(opts: {
    channel?: Partial<MessengerChannel>;
    /** Session auto-reply override for the resolved session. */
    sessionMode?: string;
    thread?: Partial<ChannelThread> | null;
    duplicate?: boolean;
    openConversation?: Partial<Conversation> | null;
  }) {
    const channel = {
      id: 10,
      tenantId: 1,
      provider: 'telegram',
      autoReply: 1,
      replyMode: 'auto',
      consentMode: 'notice',
      ...opts.channel,
    } as MessengerChannel;

    const savedThreads: Partial<ChannelThread>[] = [];
    const threadUpdates: Array<Partial<ChannelThread>> = [];
    const threadRepo = {
      findOne: jest.fn(async () => (opts.thread ?? null) as ChannelThread | null),
      create: (t: Partial<ChannelThread>) => ({ id: 55, ...t }) as ChannelThread,
      save: jest.fn(async (t: ChannelThread) => {
        savedThreads.push(t);
        return t;
      }),
      update: jest.fn(async (_w: unknown, patch: Partial<ChannelThread>) => {
        threadUpdates.push(patch);
        return { affected: 1 };
      }),
    } as unknown as Repository<ChannelThread>;

    const savedMaps: Partial<ChannelMessageMap>[] = [];
    const mapRepo = {
      findOne: jest.fn(async () => (opts.duplicate ? ({ id: 1 } as ChannelMessageMap) : null)),
      create: (m: Partial<ChannelMessageMap>) => m as ChannelMessageMap,
      save: jest.fn(async (m: ChannelMessageMap) => {
        savedMaps.push(m);
        return m;
      }),
    } as unknown as Repository<ChannelMessageMap>;

    const savedSessions: Partial<Session>[] = [];
    const sessionRepo = {
      findOne: jest.fn(async () => null),
      create: (s: Partial<Session>) =>
        ({ id: 90, autoReplyMode: opts.sessionMode ?? 'inherit', ...s }) as Session,
      save: jest.fn(async (s: Session) => {
        savedSessions.push(s);
        return s;
      }),
    } as unknown as Repository<Session>;

    const savedConversations: Partial<Conversation>[] = [];
    const convRepo = {
      create: (c: Partial<Conversation>) => ({ id: 300, ...c }) as Conversation,
      save: jest.fn(async (c: Conversation) => {
        savedConversations.push(c);
        return c;
      }),
    } as unknown as Repository<Conversation>;

    const savedMessages: Partial<Message>[] = [];
    const msgRepo = {
      // First call = pre-call high-water mark, later = the user turn lookup.
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 500 } as Message)
        .mockResolvedValue({ id: 501, senderType: 'user' } as Message),
      create: (m: Partial<Message>) => m as Message,
      save: jest.fn(async (m: Message) => {
        savedMessages.push(m);
        return { id: 501, ...m } as Message;
      }),
    } as unknown as Repository<Message>;

    const savedDrafts: Array<Record<string, unknown>> = [];
    const draftRepo = {
      create: (d: Record<string, unknown>) => d,
      save: jest.fn(async (d: Record<string, unknown>) => {
        savedDrafts.push(d);
        return d;
      }),
    } as unknown as Repository<never>;

    const chatService = {
      handleUserMessage: jest.fn(async (_s: unknown, _t: string, o?: { draft?: boolean }) =>
        o?.draft
          ? {
              conversationId: '300',
              reply: null,
              draft: { body: 'proposed answer', confidence: 0.82 },
              escalate: false,
              needsAuth: false,
            }
          : { conversationId: '300', reply: null, escalate: false, needsAuth: false },
      ),
      findOpenConversation: jest.fn(async () => (opts.openConversation ?? null) as Conversation | null),
      escalate: jest.fn(async () => undefined),
    } as unknown as ChatService;

    const sessionService = {
      effectiveNoticeVersion: jest.fn(async () => '2026-07'),
      languageForChannel: jest.fn(async (_tenantId: number, hint?: string | null) =>
        (hint ?? '').toLowerCase().startsWith('ko') ? 'KO' : 'EN',
      ),
    } as unknown as SessionService;

    const outbox = { flushThread: jest.fn(async () => undefined) } as unknown as MessengerOutboxService;

    const service = new MessengerIngestService(
      threadRepo,
      mapRepo,
      sessionRepo,
      convRepo,
      msgRepo,
      draftRepo,
      chatService,
      sessionService,
      outbox,
    );
    return {
      service,
      channel,
      chatService,
      sessionService,
      outbox,
      savedMaps,
      savedSessions,
      savedConversations,
      savedMessages,
      savedDrafts,
      threadUpdates,
    };
  }

  it('runs the chat pipeline and maps the inbound message', async () => {
    const h = build({});
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 90 }), inbound.text);
    expect(h.savedMaps[0]).toMatchObject({ externalMessageId: 'ext-100', direction: 'inbound', messageId: 501 });
    // The AI answer must not wait for the worker tick.
    expect(h.outbox.flushThread).toHaveBeenCalled();
  });

  it('skips a redelivered message — loop prevention #2', async () => {
    const h = build({ thread: { id: 55, tenantId: 1, channelId: 10, replyEnabled: 1 }, duplicate: true });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).not.toHaveBeenCalled();
    expect(h.savedMaps).toHaveLength(0);
  });

  it('records consent on the new session — an external channel has no banner', async () => {
    const h = build({});
    await h.service.ingestOne(h.channel, inbound);

    expect(h.savedSessions[0]).toMatchObject({
      consentState: 'granted',
      consentVersion: '2026-07',
      channel: 'telegram',
      language: 'KO',
    });
    // 'notice' mode also posts the notice itself, so it is relayed and visible.
    expect(h.savedMessages.some((m) => m.senderType === 'system')).toBe(true);
  });

  it('omits the notice message when the channel is consent_mode=auto', async () => {
    const h = build({ channel: { consentMode: 'auto' } });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.savedMessages.some((m) => m.senderType === 'system')).toBe(false);
  });

  it('stores and escalates instead of answering when auto-reply is off', async () => {
    const h = build({ channel: { replyMode: 'off' } });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).not.toHaveBeenCalled();
    expect(h.savedMessages.some((m) => m.senderType === 'user')).toBe(true);
    expect(h.chatService.escalate).toHaveBeenCalled();
  });

  it('stays silent when a human already owns the thread', async () => {
    const h = build({
      openConversation: { id: 300, status: 'agent', agentId: 7, sessionId: 90 },
    });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).not.toHaveBeenCalled();
    expect(h.chatService.escalate).not.toHaveBeenCalled();
    expect(h.savedMessages.some((m) => m.senderType === 'user')).toBe(true);
  });

  it('lets a session override turn the AI on where the channel default is off', async () => {
    const h = build({ channel: { replyMode: 'off' }, sessionMode: 'auto' });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).toHaveBeenCalled();
  });

  it('lets a session override silence a channel whose default is on', async () => {
    const h = build({ channel: { replyMode: 'auto' }, sessionMode: 'off' });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).not.toHaveBeenCalled();
    expect(h.savedMessages.some((m) => m.senderType === 'user')).toBe(true);
  });

  it('escalates once, not on every message of an already-escalated thread', async () => {
    const h = build({
      channel: { replyMode: 'off' },
      openConversation: { id: 300, status: 'waiting', agentId: null, sessionId: 90, escalated: 1 },
    });
    await h.service.ingestOne(h.channel, inbound);

    // 400 inbound across 37 conversations paged the agents 400 times (B-1).
    expect(h.chatService.escalate).not.toHaveBeenCalled();
    expect(h.savedMessages.some((m) => m.senderType === 'user')).toBe(true);
  });

  it('asks for the tenant default language when the platform sends no hint', async () => {
    const h = build({});
    await h.service.ingestOne(h.channel, { ...inbound, languageHint: null });

    expect(h.sessionService.languageForChannel).toHaveBeenCalledWith(1, null);
  });

  it('stores a draft instead of answering when the channel needs approval', async () => {
    const h = build({ channel: { replyMode: 'approve' } });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.chatService.handleUserMessage).toHaveBeenCalledWith(
      expect.anything(),
      inbound.text,
      { draft: true },
    );
    expect(h.savedDrafts[0]).toMatchObject({ body: 'proposed answer', confidence: 0.82 });
    // A draft nobody sees is a draft nobody sends.
    expect(h.chatService.escalate).toHaveBeenCalled();
  });

  it('lets a session ask for approval on an otherwise automatic channel', async () => {
    const h = build({ channel: { replyMode: 'auto' }, sessionMode: 'approve' });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.savedDrafts).toHaveLength(1);
  });

  it('never drafts while an agent holds the thread', async () => {
    const h = build({
      channel: { replyMode: 'approve' },
      openConversation: { id: 300, status: 'agent', agentId: 7, sessionId: 90 },
    });
    await h.service.ingestOne(h.channel, inbound);

    expect(h.savedDrafts).toHaveLength(0);
    expect(h.chatService.handleUserMessage).not.toHaveBeenCalled();
  });

  it('records the inbound cursor for poll adapters', async () => {
    const h = build({});
    await h.service.ingestOne(h.channel, inbound);
    expect(h.threadUpdates.some((p) => p.inboundCursor === 'ext-100')).toBe(true);
  });
});
