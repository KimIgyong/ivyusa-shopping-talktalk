import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';
import { toSessionResponse } from './agent.mapper';
import { Message } from '../chat/entity/message.entity';

/** listSessions — queue query, customer-name search branch (PLN-260804). */
describe('AgentService.listSessions', () => {
  const conv = (id: number, sessionId: number): Conversation =>
    ({ id, tenantId: 1, sessionId, status: 'waiting', createdAt: new Date() }) as Conversation;

  function build(opts: {
    conversations?: Conversation[];
    customers?: Array<{ id: number }>;
    sessions?: Array<{ id: number }>;
  }) {
    const convRepo = {
      findAndCount: jest.fn().mockResolvedValue([opts.conversations ?? [], (opts.conversations ?? []).length]),
    };
    const msgRepo = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const sessionRepo = { find: jest.fn().mockResolvedValue(opts.sessions ?? []) };
    const customerService = {
      searchByEmailOrName: jest.fn().mockResolvedValue(opts.customers ?? []),
      namesByIds: jest.fn().mockResolvedValue(new Map()),
    };
    const svc = new AgentService(
      convRepo as never,
      msgRepo as never,
      {} as never, // userRepo
      sessionRepo as never,
      {} as never, // profileRepo
      {} as never, // assignmentRepo
      {} as never, // statRepo
      {} as never, // moderation
      customerService as never,
      {} as never, // aiGateway
      {} as never, // audit
      {} as never, // redis
      {} as never, // sessionService
      {} as never, // bus
    );
    return { svc, convRepo, sessionRepo, customerService };
  }

  it('without q, lists the queue unfiltered', async () => {
    const { svc, convRepo, customerService } = build({ conversations: [conv(2, 20), conv(1, 10)] });
    const res = await svc.listSessions(1, 1, 20);
    expect(res.total).toBe(2);
    expect(customerService.searchByEmailOrName).not.toHaveBeenCalled();
    expect(convRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ sessionId: expect.anything() }) }),
    );
  });

  it('with q, filters by the matched customers sessions', async () => {
    const { svc, convRepo, sessionRepo, customerService } = build({
      conversations: [conv(3, 30)],
      customers: [{ id: 7 }],
      sessions: [{ id: 30 }],
    });
    const res = await svc.listSessions(1, 1, 20, 'kim');
    expect(customerService.searchByEmailOrName).toHaveBeenCalledWith(1, 'kim', 20);
    expect(sessionRepo.find).toHaveBeenCalled();
    expect(convRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sessionId: expect.anything() }) }),
    );
    expect(res.total).toBe(1);
  });

  it('with q matching no customer, returns an empty page without touching conversations', async () => {
    const { svc, convRepo } = build({ customers: [] });
    const res = await svc.listSessions(1, 1, 20, 'nobody');
    expect(res).toEqual({ items: [], total: 0 });
    expect(convRepo.findAndCount).not.toHaveBeenCalled();
  });
});

describe('toSessionResponse', () => {
  it('carries the last message time for the queue row', () => {
    const at = new Date('2026-08-04T10:00:00Z');
    const res = toSessionResponse(
      { id: 1, status: 'waiting', escalated: 0, createdAt: new Date() } as Conversation,
      { body: 'hello there', createdAt: at } as Message,
      'Kim',
    );
    expect(res.lastMessageAt).toBe(at);
    expect(res.lastMessagePreview).toBe('hello there');
  });

  it('nulls both preview and time when the thread has no messages', () => {
    const res = toSessionResponse(
      { id: 1, status: 'waiting', escalated: 0, createdAt: new Date() } as Conversation,
      null,
    );
    expect(res.lastMessageAt).toBeNull();
    expect(res.lastMessagePreview).toBeNull();
  });
});
