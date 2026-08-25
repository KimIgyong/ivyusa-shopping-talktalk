import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';

/**
 * Live-chat agent controls (REQ-260825 R8): re-pinning a session's AI agent
 * (tenant fence + cache bust), assigning a human agent (assignment hand-over),
 * and manual issue filing delegation.
 */
describe('AgentService — AI agent & assignment (REQ-260825)', () => {
  function build(opts: { agent?: Record<string, unknown> | null; targetUser?: Record<string, unknown> | null } = {}) {
    const conversation = { id: 5, tenantId: 1, sessionId: 90, agentId: null, status: 'waiting' } as unknown as Conversation;
    const convRepo = {
      findOne: jest.fn(async (q: { where: { id: number; tenantId: number } }) =>
        q.where.id === 5 && q.where.tenantId === 1 ? conversation : null,
      ),
      save: jest.fn(async (c: Conversation) => c),
    };
    const sessionUpdates: Array<Record<string, unknown>> = [];
    const sessionRepo = {
      update: jest.fn(async (_w: unknown, patch: Record<string, unknown>) => {
        sessionUpdates.push(patch);
        return { affected: 1 };
      }),
      findOne: jest.fn(async () => ({ id: 90, sessionToken: 'tok-9' })),
    };
    const aiAgentRepo = {
      findOne: jest.fn(async () => (opts.agent === undefined ? { id: 7, tenantId: 1, name: 'Livy-agent', displayName: 'Livy', active: 1 } : opts.agent)),
      find: jest.fn(async () => []),
    };
    const userRepo = {
      findOne: jest.fn(async () =>
        opts.targetUser === undefined ? { id: 22, tenantId: 1, status: 'active', name: '김상담' } : opts.targetUser,
      ),
    };
    const assignmentRepo = {
      update: jest.fn(async () => ({ affected: 1 })),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (v: unknown) => v),
      count: jest.fn(async () => 0),
    };
    const redis = { del: jest.fn(async () => undefined), get: jest.fn(), set: jest.fn(), available: () => true };
    const audit = { write: jest.fn(async () => undefined) };
    const issueService = {
      onAgentAccept: jest.fn(async () => undefined),
      createManual: jest.fn(async () => ({ issue: { id: 30, issueNo: 12 }, appended: false })),
    };

    const svc = new AgentService(
      convRepo as never,
      {} as never, // msgRepo
      userRepo as never,
      sessionRepo as never,
      {} as never, // profileRepo
      assignmentRepo as never,
      {} as never, // statRepo
      {} as never, // moderation
      {} as never, // customerService
      {} as never, // aiGateway
      audit as never,
      redis as never,
      {} as never, // sessionService
      {} as never, // bus
      {} as never, // mailer
      undefined, // answerReuse
      issueService as never, // issueService
      undefined, // aiConfigRepo
      undefined, // threadRepo
      undefined, // channelRepo
      undefined, // draftRepo
      undefined, // attachments
      aiAgentRepo as never,
    );
    return { svc, sessionUpdates, redis, aiAgentRepo, assignmentRepo, convRepo, issueService, conversation };
  }

  it('re-pins the session and busts the token→session cache', async () => {
    const h = build();

    const result = await h.svc.setSessionAiAgent(5, 1, 7, 7);

    expect(h.sessionUpdates[0]).toEqual({ aiAgentId: 7 });
    expect(h.redis.del).toHaveBeenCalledWith(expect.stringContaining('tok-9'));
    expect(result.aiAgentName).toBe('Livy');
  });

  it("refuses an agent that is not the tenant's (or inactive)", async () => {
    const h = build({ agent: null });

    await expect(h.svc.setSessionAiAgent(5, 1, 7, 99)).rejects.toMatchObject({
      errorCode: 'E5050',
    });
    expect(h.sessionUpdates).toHaveLength(0);
  });

  it('assign hands over: old assignment transferred, new active row, conversation owned', async () => {
    const h = build();

    const c = await h.svc.assignConversation(5, 1, 7, 22);

    expect(h.assignmentRepo.update).toHaveBeenCalledWith(
      { tenantId: 1, conversationId: 5, status: 'active' },
      expect.objectContaining({ status: 'transferred' }),
    );
    expect(h.assignmentRepo.save).toHaveBeenCalled();
    expect(c.agentId).toBe(22);
    expect(c.status).toBe('agent');
    // Open issue (if any) follows the new owner.
    expect(h.issueService.onAgentAccept).toHaveBeenCalledWith(5, 1, 22);
  });

  it('refuses assigning to a suspended or foreign user', async () => {
    const h = build({ targetUser: { id: 22, tenantId: 1, status: 'suspended' } });

    await expect(h.svc.assignConversation(5, 1, 7, 22)).rejects.toThrow();
    expect(h.assignmentRepo.save).not.toHaveBeenCalled();
  });

  it('fileIssue delegates with the conversation session and returns the issue no', async () => {
    const h = build();

    const result = await h.svc.fileIssue(5, 1, 7, 'delivery');

    expect(h.issueService.createManual).toHaveBeenCalledWith(1, 5, 90, 'delivery', 7, {
      note: null,
    });
    expect(result).toEqual({ issueId: 30, issueNo: 12, appended: false });
  });
});
