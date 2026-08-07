import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';

/**
 * Transcript paging (PLN-260807). The console used to receive every message a
 * conversation ever had; it now takes the recent tail and walks back on demand.
 */
describe('AgentService.listMessages — paging', () => {
  function build(rows: Message[]) {
    const find = jest.fn(async () => rows);
    const svc = new AgentService(
      { findOne: jest.fn(async () => ({ id: 7, tenantId: 1 }) as Conversation) } as never,
      { find } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { svc, find };
  }

  const msg = (id: number): Message => ({ id, body: `m${id}` }) as Message;

  it('returns the newest page in ascending order', async () => {
    // Repo is queried DESC; the caller renders oldest → newest.
    const { svc, find } = build([msg(30), msg(29), msg(28)]);
    const res = await svc.listMessages(7, 1, { limit: 3 });
    expect(res.messages.map((m) => m.id)).toEqual([28, 29, 30]);
    expect(res.hasMore).toBe(false);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { id: 'DESC' }, take: 4 }),
    );
  });

  it('flags more history when the probe row comes back', async () => {
    // limit+1 rows means at least one older message exists.
    const { svc } = build([msg(30), msg(29), msg(28), msg(27)]);
    const res = await svc.listMessages(7, 1, { limit: 3 });
    expect(res.messages).toHaveLength(3);
    expect(res.hasMore).toBe(true);
  });

  it('walks backwards from beforeId', async () => {
    const { svc, find } = build([msg(20), msg(19)]);
    await svc.listMessages(7, 1, { limit: 2, beforeId: 21 });
    const where = (find.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.id).toBeDefined(); // LessThan(21)
  });

  it('caps an absurd limit instead of trusting the query string', async () => {
    const { svc, find } = build([]);
    await svc.listMessages(7, 1, { limit: 99999 });
    expect((find.mock.calls[0][0] as { take: number }).take).toBe(201);
  });
});
