import { Repository } from 'typeorm';
import { ChatService } from './chat.service';
import { Conversation } from './entity/conversation.entity';
import { Session } from '../session/entity/session.entity';

/**
 * Customer-side end chat (PLN-260808 Track B): ends the open conversation,
 * releases the active assignment, and no-ops safely when nothing is open.
 */
describe('ChatService.endBySession', () => {
  function build(openConversation: Conversation | null) {
    const convUpdate = jest.fn();
    const assignmentUpdate = jest.fn();
    const svc = new ChatService(
      {
        findOne: jest.fn(async () => openConversation),
        update: convUpdate,
      } as unknown as Repository<Conversation>,
      {} as never, // Message repo
      {} as never, // Session repo
      {} as never, // Tenant repo
      {} as never, // User repo
      { update: assignmentUpdate } as never, // Assignment repo
      {} as never, // RagService
      {} as never, // ModerationService
      {} as never, // OrderService
      {} as never, // SessionService
      {} as never, // HandoffRouterService
      {} as never, // EventBusService
      {} as never, // CustomerService
      {} as never, // RedisService
    );
    return { svc, convUpdate, assignmentUpdate };
  }
  const session = { id: 5, tenantId: 1 } as Session;

  it('ends the open conversation and releases the active assignment', async () => {
    const { svc, convUpdate, assignmentUpdate } = build({ id: 77, sessionId: 5 } as Conversation);
    const out = await svc.endBySession(session);
    expect(out).toEqual({ ended: true, conversationId: '77' });
    expect(convUpdate).toHaveBeenCalledWith(
      { id: 77 },
      expect.objectContaining({ status: 'ended', endedAt: expect.any(Date) }),
    );
    expect(assignmentUpdate).toHaveBeenCalledWith(
      { conversationId: 77, status: 'active' },
      expect.objectContaining({ status: 'released', releasedAt: expect.any(Date) }),
    );
  });

  it('no-ops (still 200) when nothing is open — double-press must not error', async () => {
    const { svc, convUpdate } = build(null);
    await expect(svc.endBySession(session)).resolves.toEqual({
      ended: false,
      conversationId: null,
    });
    expect(convUpdate).not.toHaveBeenCalled();
  });
});
