import { CONVERSATION_STATUS, SENDER_TYPE } from '@ivy/types';
import { IdleConversationService } from './idle-conversation.service';

const MIN = 60_000;
const DAY = 86_400_000;

/**
 * The sweep decides, without a human in the loop, to speak to a customer and
 * to close their conversation. Both are visible actions, so each rule here is
 * pinned: who gets asked, who gets asked nothing, and who is left alone.
 */
describe('IdleConversationService.sweep', () => {
  const conv = (over: Record<string, unknown> = {}) => ({
    id: 42,
    tenantId: 1,
    sessionId: 9,
    status: CONVERSATION_STATUS.AGENT,
    replyChannel: null,
    idlePromptAt: null,
    createdAt: new Date(Date.now() - DAY),
    ...over,
  });

  /**
   * The sweep leans on the WHERE clause for its exclusions, so the fake honours
   * FindOperators instead of returning everything — otherwise the tests would
   * pass while the real query let excluded rows through.
   */
  const matches = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([key, cond]: [string, any]) => {
      const value = row[key];
      if (cond && typeof cond === 'object' && '_type' in cond) {
        if (cond._type === 'isNull') return value == null;
        if (cond._type === 'in') return cond._value.includes(value);
        if (cond._type === 'lessThan') return value != null && value < cond._value;
        if (cond._type === 'moreThan') return value != null && value > cond._value;
        return true;
      }
      return value === cond;
    });

  function build(conversations: any[], lastMessageAt: Date | null, userRepliesAfter = 0) {
    const saved: any[] = [];
    const updates: any[] = [];
    const audits: string[] = [];
    const convRepo = {
      find: jest.fn(async ({ where }: any) => conversations.filter((c) => matches(c, where))),
      update: jest.fn(async (where: any, patch: any) => void updates.push({ where, patch })),
    };
    const msgRepo = {
      findOne: jest.fn(async () => (lastMessageAt ? { createdAt: lastMessageAt } : null)),
      count: jest.fn(async () => userRepliesAfter),
      create: (m: any) => m,
      save: jest.fn(async (m: any) => void saved.push(m)),
    };
    const sessionRepo = { findOne: jest.fn(async () => ({ id: 9, language: 'KO' })) };
    const assignmentRepo = { update: jest.fn(async () => undefined) };
    const audit = { write: jest.fn(async (a: any) => void audits.push(a.action)) };

    const svc = new IdleConversationService(
      convRepo as never,
      msgRepo as never,
      sessionRepo as never,
      assignmentRepo as never,
      audit as never,
    );
    return { svc, saved, updates, audits, assignmentRepo };
  }

  describe('asking', () => {
    it('asks a thread that has been quiet past the threshold', async () => {
      const { svc, saved, updates, audits } = build([conv()], new Date(Date.now() - 45 * MIN));

      const res = await svc.sweep();

      expect(res.prompted).toBe(1);
      expect(saved[0]).toMatchObject({ senderType: SENDER_TYPE.SYSTEM, lang: 'KO' });
      expect(saved[0].body).toContain('더 도와드릴');
      expect(updates.some((u) => u.patch.idlePromptAt instanceof Date)).toBe(true);
      expect(audits).toContain('chat.idle_prompted');
    });

    it('leaves a recently active thread alone', async () => {
      const { svc, saved } = build([conv()], new Date(Date.now() - 5 * MIN));

      const res = await svc.sweep();

      expect(res.prompted).toBe(0);
      expect(saved).toHaveLength(0);
    });

    it('never asks twice — the latch is the guard', async () => {
      // A thread already asked carries idle_prompt_at, so the ask pass skips it
      // even though it is still quiet.
      const { svc, saved } = build(
        [conv({ idlePromptAt: new Date(Date.now() - 10_000) })],
        new Date(Date.now() - 45 * MIN),
      );

      const res = await svc.sweep();

      expect(res.prompted).toBe(0);
      expect(saved).toHaveLength(0);
    });
  });

  describe('closing', () => {
    it('closes after the grace period with the satisfaction line', async () => {
      const { svc, saved, updates, assignmentRepo, audits } = build(
        [conv({ idlePromptAt: new Date(Date.now() - 90_000) })],
        new Date(Date.now() - 45 * MIN),
      );

      const res = await svc.sweep();

      expect(res.closed).toBe(1);
      expect(saved[0].body).toContain('만족');
      const closing = updates.find((u) => u.patch.status === CONVERSATION_STATUS.ENDED);
      expect(closing.patch.endedAt).toBeInstanceOf(Date);
      expect(closing.patch.idlePromptAt).toBeNull();
      expect(assignmentRepo.update).toHaveBeenCalled();
      expect(audits).toContain('chat.idle_closed');
    });

    it('does not close a customer who answered after being asked', async () => {
      const { svc, updates } = build(
        [conv({ idlePromptAt: new Date(Date.now() - 90_000) })],
        new Date(),
        1, // one user message after the prompt
      );

      const res = await svc.sweep();

      expect(res.closed).toBe(0);
      expect(updates[0].patch).toEqual({ idlePromptAt: null });
    });

    it('closes a long-dead thread silently, without asking anything', async () => {
      // Saying "anything else?" about a conversation from six weeks ago reads
      // as a glitch, so the question is skipped entirely.
      const { svc, saved, updates } = build([conv()], new Date(Date.now() - 40 * DAY));

      const res = await svc.sweep();

      expect(res.prompted).toBe(0);
      // Reported, not swallowed: the first version logged "closed 0" on a sweep
      // that had just ended thirteen conversations.
      expect(res.silentlyClosed).toBe(1);
      expect(saved).toHaveLength(0);
      expect(updates.some((u) => u.patch.status === CONVERSATION_STATUS.ENDED)).toBe(true);
    });
  });

  describe('exclusions', () => {
    it('never touches a thread awaiting a promised email reply', async () => {
      // Closing it would cancel an answer the customer was told to expect.
      const { svc, saved, updates } = build(
        [conv({ replyChannel: 'email' })],
        new Date(Date.now() - 45 * MIN),
      );

      const res = await svc.sweep();

      expect(res).toEqual({ prompted: 0, closed: 0, silentlyClosed: 0 });
      expect(saved).toHaveLength(0);
      expect(updates).toHaveLength(0);
    });
    it('spares a thread that went off hours after being asked', async () => {
      // Asked while on hours, then routed to email — closing it now would
      // cancel the reply the customer was told to expect.
      const { svc, updates } = build(
        [conv({ idlePromptAt: new Date(Date.now() - 90_000), replyChannel: 'email' })],
        new Date(Date.now() - 45 * MIN),
      );

      const res = await svc.sweep();

      expect(res.closed).toBe(0);
      expect(updates).toHaveLength(0);
    });
  });

  it('survives a repository failure without killing the tick', async () => {
    const { svc } = build([conv()], new Date(Date.now() - 45 * MIN));
    (svc as never as { convRepo: { find: jest.Mock } }).convRepo.find.mockRejectedValue(
      new Error('db down'),
    );

    await expect(svc.sweep()).resolves.toEqual({ prompted: 0, closed: 0, silentlyClosed: 0 });
  });
});
