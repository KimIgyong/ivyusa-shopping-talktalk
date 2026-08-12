import { CONVERSATION_STATUS, SENDER_TYPE } from '@ivy/types';
import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';

/**
 * Handback is a state transition with three moving parts — status, assignment
 * and `agent_id` — and leaving any of them behind reintroduces the silence it
 * exists to undo.
 */
describe('AgentService.handBack', () => {
  function build(conversation: Partial<Conversation>, config?: unknown) {
    const saved: any[] = [];
    const updates: any[] = [];
    const audits: any[] = [];
    const row = { id: 42, tenantId: 1, sessionId: 9, agentId: 5, ...conversation };

    const convRepo = {
      findOne: jest.fn(async () => row as Conversation),
      findOneOrFail: jest.fn(async () => ({ ...row, status: CONVERSATION_STATUS.AI_ACTIVE })),
      update: jest.fn(async (where: unknown, patch: unknown) => void updates.push({ where, patch })),
    };
    const msgRepo = {
      create: (m: any) => m,
      save: jest.fn(async (m: any) => void saved.push(m)),
    };
    const assignmentRepo = {
      update: jest.fn(async (where: unknown, patch: unknown) =>
        void updates.push({ where, patch, kind: 'assignment' }),
      ),
    };
    const sessionRepo = { findOne: jest.fn(async () => ({ id: 9, language: 'KO' })) };
    const audit = { write: jest.fn(async (a: unknown) => void audits.push(a)) };
    const aiConfigRepo = { findOne: jest.fn(async () => config ?? null) };

    const svc = new AgentService(
      convRepo as never,
      msgRepo as never,
      {} as never,
      sessionRepo as never,
      {} as never,
      assignmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      aiConfigRepo as never,
    );
    return { svc, saved, updates, audits, convRepo, assignmentRepo };
  }

  it('returns the thread to the AI without ending it', async () => {
    const { svc, updates } = build({ status: CONVERSATION_STATUS.AGENT });

    await svc.handBack(42, 1, 77);

    const convUpdate = updates.find((u) => u.kind !== 'assignment');
    expect(convUpdate.patch).toMatchObject({ status: CONVERSATION_STATUS.AI_ACTIVE });
    // Not ended: no endedAt is written.
    expect(convUpdate.patch).not.toHaveProperty('endedAt');
  });

  it('clears agent_id — the silence rule also fires on waiting + agentId', async () => {
    const { svc, updates } = build({ status: CONVERSATION_STATUS.AGENT });

    await svc.handBack(42, 1, 77);

    expect(updates.find((u) => u.kind !== 'assignment').patch.agentId).toBeNull();
  });

  it('releases the active assignment', async () => {
    const { svc, updates } = build({ status: CONVERSATION_STATUS.AGENT });

    await svc.handBack(42, 1, 77);

    const assignment = updates.find((u) => u.kind === 'assignment');
    expect(assignment.where).toMatchObject({ conversationId: 42, status: 'active' });
    expect(assignment.patch).toMatchObject({ status: 'released' });
  });

  it('tells the customer, in the session language', async () => {
    const { svc, saved } = build({ status: CONVERSATION_STATUS.AGENT });

    await svc.handBack(42, 1, 77);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ senderType: SENDER_TYPE.SYSTEM, lang: 'KO' });
    expect(saved[0].body).toContain('AI 상담원');
  });

  it("uses the tenant's wording when it set one", async () => {
    const { svc, saved } = build(
      { status: CONVERSATION_STATUS.AGENT },
      { handoffConfig: { handbackNotice: { KO: '담당자 확인이 끝났습니다.' } } },
    );

    await svc.handBack(42, 1, 77);

    expect(saved[0].body).toBe('담당자 확인이 끝났습니다.');
  });

  it('falls back to English when the tenant wrote only that', async () => {
    const { svc, saved } = build(
      { status: CONVERSATION_STATUS.AGENT },
      { handoffConfig: { handbackNotice: { EN: 'Back to the assistant.' } } },
    );

    await svc.handBack(42, 1, 77);

    expect(saved[0].body).toBe('Back to the assistant.');
  });

  it('records who handed it back, and from whom', async () => {
    const { svc, audits } = build({ status: CONVERSATION_STATUS.AGENT, agentId: 5 });

    await svc.handBack(42, 1, 77);

    expect(audits[0]).toMatchObject({
      action: 'agent.handed_back',
      actorId: 77,
      target: 'conversation:42',
      metadata: { previousAgentId: 5 },
    });
  });

  it.each([CONVERSATION_STATUS.AI_ACTIVE, CONVERSATION_STATUS.WAITING, CONVERSATION_STATUS.ENDED])(
    'refuses a conversation in %s — nothing to hand back',
    async (status) => {
      const { svc, updates, saved } = build({ status });

      await expect(svc.handBack(42, 1, 77)).rejects.toThrow();

      expect(updates).toHaveLength(0);
      expect(saved).toHaveLength(0);
    },
  );

  it('still transitions when the wording lookup fails', async () => {
    // Notice text is not worth failing a state change over — the thread would
    // stay mute for the sake of a sentence.
    const { svc, updates } = build({ status: CONVERSATION_STATUS.AGENT });
    (svc as never as { aiConfigRepo: { findOne: jest.Mock } }).aiConfigRepo.findOne.mockRejectedValue(
      new Error('db down'),
    );

    await svc.handBack(42, 1, 77);

    expect(updates.find((u) => u.kind !== 'assignment').patch.status).toBe(
      CONVERSATION_STATUS.AI_ACTIVE,
    );
  });
});
