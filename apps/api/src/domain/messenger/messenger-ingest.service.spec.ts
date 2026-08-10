import { Repository } from 'typeorm';
import { MessengerIngestService, resolveLanguage } from './messenger-ingest.service';
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
    thread?: Partial<ChannelThread> | null;
    duplicate?: boolean;
    openConversation?: Partial<Conversation> | null;
  }) {
    const channel = {
      id: 10,
      tenantId: 1,
      provider: 'telegram',
      autoReply: 1,
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
      create: (s: Partial<Session>) => ({ id: 90, ...s }) as Session,
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

    const chatService = {
      handleUserMessage: jest.fn(async () => ({ conversationId: '300', reply: null, escalate: false, needsAuth: false })),
      findOpenConversation: jest.fn(async () => (opts.openConversation ?? null) as Conversation | null),
      escalate: jest.fn(async () => undefined),
    } as unknown as ChatService;

    const sessionService = {
      effectiveNoticeVersion: jest.fn(async () => '2026-07'),
    } as unknown as SessionService;

    const outbox = { flushThread: jest.fn(async () => undefined) } as unknown as MessengerOutboxService;

    const service = new MessengerIngestService(
      threadRepo,
      mapRepo,
      sessionRepo,
      convRepo,
      msgRepo,
      chatService,
      sessionService,
      outbox,
    );
    return { service, channel, chatService, outbox, savedMaps, savedSessions, savedConversations, savedMessages, threadUpdates };
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
    const h = build({ channel: { autoReply: 0 } });
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

  it('records the inbound cursor for poll adapters', async () => {
    const h = build({});
    await h.service.ingestOne(h.channel, inbound);
    expect(h.threadUpdates.some((p) => p.inboundCursor === 'ext-100')).toBe(true);
  });
});

describe('resolveLanguage', () => {
  it.each([
    ['ko-KR', 'KO'],
    ['ko', 'KO'],
    ['es-ES', 'ES'],
    ['en-US', 'EN'],
    [null, 'EN'],
    ['vi', 'EN'],
  ])('maps %s → %s', (hint, expected) => {
    expect(resolveLanguage(hint as string | null)).toBe(expected);
  });
});
