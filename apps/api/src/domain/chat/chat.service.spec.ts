import { Repository } from 'typeorm';
import { CONSENT_STATE, CONVERSATION_STATUS, MODERATION_DECISION } from '@ivy/types';
import { ChatService } from './chat.service';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { RagService } from './rag.service';
import { ModerationService } from '../moderation/moderation.service';
import { CONSENT_NOTICE_VERSION, SessionService } from '../session/session.service';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';

/**
 * Consent fail-closed gate on the message path (PLN-Privacy-Control-Gap Stage 1,
 * D-1: GRANTED-only). Uses a REAL SessionService over mocked repos so the
 * outdated-version degradation and the fresh (uncached) read are exercised.
 */
describe('ChatService consent gate', () => {
  let svc: ChatService;
  let session: Session;
  let msgSave: jest.Mock;
  let convFindOne: jest.Mock;
  let convSave: jest.Mock;
  let busPublish: jest.Mock;
  let ragClassify: jest.Mock;
  let ragAnswer: jest.Mock;
  let moderate: jest.Mock;

  const makeSession = (consentState: string, consentVersion: string | null): Session =>
    ({
      id: 5,
      sessionToken: 'tok-5',
      tenantId: 1,
      customerId: null,
      identityLevel: 'guest',
      language: 'EN',
      consentState,
      consentAt: null,
      consentVersion,
    }) as Session;

  const build = () => {
    const conversation = {
      id: 77,
      sessionId: 5,
      tenantId: 1,
      status: CONVERSATION_STATUS.AI_ACTIVE,
    } as Conversation;

    convFindOne = jest.fn(async () => conversation);
    convSave = jest.fn(async (c: Conversation) => c);
    msgSave = jest.fn(async (m: Message) => m);
    busPublish = jest.fn();
    ragClassify = jest.fn(async () => ({ needsOrderData: false }));
    ragAnswer = jest.fn(async () => ({ text: 'AI answer', confidence: 0.9, citations: [] }));
    moderate = jest.fn(async () => ({ decision: MODERATION_DECISION.DELIVERED, text: 'AI answer' }));

    const convRepo = {
      findOne: convFindOne,
      save: convSave,
      create: (c: Partial<Conversation>) => c,
      update: jest.fn(),
      findOneOrFail: jest.fn(async () => conversation),
    } as unknown as Repository<Conversation>;
    const msgRepo = {
      save: msgSave,
      create: (m: Partial<Message>) => m,
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
    } as unknown as Repository<Message>;
    // Fresh consent read: the gate must hit this repo, not any cache.
    const sessionRepo = {
      findOne: jest.fn(async () => session),
      save: jest.fn(async (s: Session) => s),
    } as unknown as Repository<Session>;
    const tenantRepo = {
      findOne: jest.fn(async () => ({ id: 1, privacyPolicyUrl: null, consentNoticeVersion: null }) as Tenant),
    } as unknown as Repository<Tenant>;
    const userRepo = { find: jest.fn(async () => []) } as unknown as Repository<User>;

    const redis = {
      available: () => false,
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as RedisService;
    const bus = { publish: busPublish } as unknown as EventBusService;
    const sessionService = new SessionService(sessionRepo, tenantRepo, bus, redis);

    svc = new ChatService(
      convRepo,
      msgRepo,
      sessionRepo,
      tenantRepo,
      userRepo,
      { classifyIntent: ragClassify, answer: ragAnswer } as unknown as RagService,
      { moderate } as unknown as ModerationService,
      // orderService precedes sessionService: it supplies the signed-in shopper's own
      // order facts for RAG grounding. These suites are about the consent gate, so it
      // returns nothing — but the position matters.
      { recentForCustomer: jest.fn(async () => []) } as never,
      sessionService,
      // Handoff routing sits between session and bus: these suites never reach
      // an escalation, so the default (page agents, broadcast) is enough.
      {
        route: jest.fn(async () => ({ mode: 'agents', targetUserIds: [] })),
      } as unknown as HandoffRouterService,
      bus,
    );
  };

  const expectSoftBlock = (result: {
    conversationId: string | null;
    reply: { senderType: string; body: string } | null;
    escalate: boolean;
    needsAuth: boolean;
  }) => {
    // null, not 0: the wire contract makes conversationId a string, and the client
    // guards on falsiness — '0' would have passed that guard.
    expect(result.conversationId).toBeNull();
    expect(result.reply?.senderType).toBe('system');
    expect(result.reply?.body).toContain('privacy notice');
    expect(result.escalate).toBe(false);
    expect(result.needsAuth).toBe(false);
    // Nothing persisted, no AI call, no CJM/log events.
    expect(msgSave).not.toHaveBeenCalled();
    expect(ragClassify).not.toHaveBeenCalled();
    expect(ragAnswer).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
    expect(busPublish).not.toHaveBeenCalled();
    expect(convSave).not.toHaveBeenCalled();
  };

  it('blocks PENDING consent (fail-closed — previously allowed)', async () => {
    session = makeSession(CONSENT_STATE.PENDING, null);
    build();
    expectSoftBlock(await svc.handleUserMessage(session, 'hello'));
  });

  it('blocks DECLINED consent', async () => {
    session = makeSession(CONSENT_STATE.DECLINED, CONSENT_NOTICE_VERSION);
    build();
    expectSoftBlock(await svc.handleUserMessage(session, 'hello'));
  });

  it('blocks a GRANTED consent recorded against an outdated notice version', async () => {
    session = makeSession(CONSENT_STATE.GRANTED, '2020-01');
    build();
    expectSoftBlock(await svc.handleUserMessage(session, 'hello'));
  });

  it('lets a current GRANTED consent proceed to persist + AI reply', async () => {
    session = makeSession(CONSENT_STATE.GRANTED, CONSENT_NOTICE_VERSION);
    build();
    const result = await svc.handleUserMessage(session, 'hello');
    // String: MySQL BIGINT ids arrive as strings, so the contract carries them as
    // strings rather than letting the boundary decide.
    expect(result.conversationId).toBe('77');
    expect(result.reply?.senderType).toBe('ai');
    expect(result.reply?.body).toBe('AI answer');
    expect(msgSave).toHaveBeenCalled(); // user turn + AI turn persisted
    expect(ragAnswer).toHaveBeenCalled();
    expect(moderate).toHaveBeenCalled();
  });

  it('scrubs PII from the AI egress copy while persisting the original (Stage 5)', async () => {
    session = makeSession(CONSENT_STATE.GRANTED, CONSENT_NOTICE_VERSION);
    build();
    const original = 'refund please, mail me at jane.doe@example.com about order #1001';
    const result = await svc.handleUserMessage(session, original);
    expect(result.reply?.senderType).toBe('ai');

    // AI provider sees the scrubbed copy…
    const egress = ragClassify.mock.calls[0][1] as string;
    expect(egress).toContain('[EMAIL]');
    expect(egress).toContain('[ORDER]');
    expect(egress).not.toContain('jane.doe@example.com');
    expect(ragAnswer.mock.calls[0][1]).toBe(egress);

    // …while the persisted user turn keeps the original text for agents.
    const persistedUserTurn = msgSave.mock.calls[0][0] as { body: string };
    expect(persistedUserTurn.body).toBe(original);
  });

  it('withdrawal regression: granted then declined → next message is blocked', async () => {
    session = makeSession(CONSENT_STATE.GRANTED, CONSENT_NOTICE_VERSION);
    build();
    const ok = await svc.handleUserMessage(session, 'first');
    expect(ok.reply?.senderType).toBe('ai');

    // The customer withdraws consent; the stale in-memory session object still
    // says granted, but the gate re-reads the DB row (fresh read) and blocks.
    session.consentState = CONSENT_STATE.DECLINED;
    const staleCopy = makeSession(CONSENT_STATE.GRANTED, CONSENT_NOTICE_VERSION);
    jest.clearAllMocks();
    expectSoftBlock(await svc.handleUserMessage(staleCopy, 'second'));
  });
});
