import { Repository } from 'typeorm';
import { KnowledgeGapService } from './knowledge-gap.service';
import { KnowledgeGapTask } from './entity/knowledge-gap-task.entity';
import { QuestionStatDaily } from '../analytics/entity/question-stat-daily.entity';
import { Message } from '../chat/entity/message.entity';
import { KnowledgeService } from './knowledge.service';
import { BusinessException } from '../../global/exception/business.exception';

/**
 * Knowledge-gap closed loop (P5, 결정 9): thresholds, idempotency, the
 * capture proposal from an agent resolution, and the human decision gates.
 */
describe('KnowledgeGapService', () => {
  function build(opts: {
    stats?: Array<Partial<QuestionStatDaily>>;
    existingTask?: Partial<KnowledgeGapTask> | null;
    messages?: { agent?: string; user?: string };
  }) {
    const saved: Array<Partial<KnowledgeGapTask>> = [];
    const taskRepo = {
      findOne: jest.fn(async () => opts.existingTask ?? null),
      save: jest.fn(async (e: KnowledgeGapTask) => {
        saved.push(e);
        return { id: 55, ...e } as KnowledgeGapTask;
      }),
      create: (e: Partial<KnowledgeGapTask>) => e as KnowledgeGapTask,
      find: jest.fn(async () => []),
    } as unknown as Repository<KnowledgeGapTask>;
    const statRepo = {
      find: jest.fn(async () => (opts.stats ?? []) as QuestionStatDaily[]),
    } as unknown as Repository<QuestionStatDaily>;
    const msgRepo = {
      findOne: jest.fn(async ({ where }: { where: { senderType: string } }) => {
        if (where.senderType === 'agent') {
          return opts.messages?.agent ? ({ body: opts.messages.agent } as Message) : null;
        }
        return opts.messages?.user ? ({ body: opts.messages.user } as Message) : null;
      }),
    } as unknown as Repository<Message>;
    const createDocument = jest.fn(async () => ({ id: 9 }));
    const knowledgeService = { createDocument } as unknown as KnowledgeService;
    const audit = { write: jest.fn(async () => undefined) } as never;
    const bus = { subscribe: jest.fn(), publish: jest.fn() } as never;
    const svc = new KnowledgeGapService(taskRepo, statRepo, msgRepo, knowledgeService, audit, bus);
    return { svc, saved, createDocument, taskRepo };
  }

  const stat = (over: Partial<QuestionStatDaily>): Partial<QuestionStatDaily> => ({
    tenantId: 1,
    statDate: new Date().toISOString().slice(0, 10),
    dimension: 'cluster',
    dimKey: 'c1',
    dimLabel: '립틴트 지속력 문의',
    asked: 0,
    escalated: 0,
    noSource: 0,
    ...over,
  });

  describe('runBatch thresholds', () => {
    it('proposes an escalation-heavy cluster (asked>=3, rate>=0.5)', async () => {
      const { svc, saved } = build({ stats: [stat({ asked: 4, escalated: 3 })] });
      await svc.runBatch();
      expect(saved[0]).toMatchObject({
        source: 'escalation_cluster',
        refKey: 'cluster:c1',
        title: '립틴트 지속력 문의',
        status: 'proposed',
      });
    });

    it('skips below-threshold clusters and proposes no-source intents', async () => {
      const { svc, saved } = build({
        stats: [
          stat({ asked: 10, escalated: 1 }), // rate 0.1 → skip
          stat({ dimension: 'intent', dimKey: 'shipping_policy', dimLabel: null, asked: 6, noSource: 4 }),
        ],
      });
      await svc.runBatch();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ source: 'no_source', refKey: 'intent:shipping_policy' });
    });

    it('never re-raises a decided task (idempotency, 결정 9)', async () => {
      const { svc, saved } = build({
        stats: [stat({ asked: 4, escalated: 3 })],
        existingTask: { id: 7, status: 'dismissed' },
      });
      await svc.runBatch();
      expect(saved).toHaveLength(0);
    });
  });

  describe('proposeFromResolution', () => {
    it('pairs the last agent answer with the question, PII-scrubbed title', async () => {
      const { svc, saved } = build({
        messages: { agent: '영업일 기준 2~3일 내 환불됩니다.', user: '환불 언제 되나요? 010-1234-5678' },
      });
      await svc.proposeFromResolution({ tenantId: 1, issueId: 9, issueNo: 37, conversationId: 7 });
      expect(saved[0]).toMatchObject({ source: 'agent_resolution', refKey: 'issue:9' });
      expect(String(saved[0].title)).not.toContain('010-1234-5678'); // scrubbed
      expect(saved[0].detail).toContain('환불');
    });

    it('skips when there is no agent answer', async () => {
      const { svc, saved } = build({ messages: { user: '질문만 있음' } });
      await svc.proposeFromResolution({ tenantId: 1, issueId: 9, conversationId: 7 });
      expect(saved).toHaveLength(0);
    });
  });

  describe('accept / dismiss (human gate)', () => {
    const proposed = (): Partial<KnowledgeGapTask> => ({
      id: 7,
      tenantId: 1,
      source: 'agent_resolution',
      refKey: 'issue:9',
      title: '환불 언제 되나요',
      detail: '영업일 기준 2~3일 내 환불됩니다.',
      status: 'proposed',
    });

    it('accept creates a KB document via the existing pipeline and marks accepted', async () => {
      const { svc, createDocument } = build({ existingTask: proposed() });
      const out = await svc.accept(1, 20, 7, { title: '환불 처리 기간' });
      expect(createDocument).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: '환불 처리 기간', category: 'faq' }),
        20,
      );
      expect(out.task.status).toBe('accepted');
    });

    it('accept without content is rejected; decided tasks cannot be re-decided', async () => {
      const { svc } = build({ existingTask: { ...proposed(), detail: null } });
      await expect(svc.accept(1, 20, 7, {})).rejects.toBeInstanceOf(BusinessException);
      const { svc: svc2 } = build({ existingTask: { ...proposed(), status: 'accepted' } });
      await expect(svc2.dismiss(1, 20, 7)).rejects.toBeInstanceOf(BusinessException);
    });
  });
});
