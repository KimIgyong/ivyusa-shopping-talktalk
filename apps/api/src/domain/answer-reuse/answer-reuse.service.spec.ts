import { Repository } from 'typeorm';
import { AnswerReuseService } from './answer-reuse.service';
import { AnswerReuse } from './entity/answer-reuse.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ReuseQdrantService } from '../../infrastructure/external/vector/reuse-qdrant.service';

/**
 * Answer reuse (PLN-260808 Track C). The service must be fail-open (any miss/
 * error → LLM path) and must refuse to store anything personal or unverified.
 */
describe('AnswerReuseService', () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD };
    delete process.env.ANSWER_REUSE_ENABLED;
  });
  afterAll(() => {
    process.env = OLD;
  });

  function build(opts: {
    provider?: string;
    searchHits?: Array<{ id: number; score: number }>;
    row?: Partial<AnswerReuse> | null;
    count?: number;
  }) {
    const repo = {
      findOne: jest.fn(async () => (opts.row === undefined ? null : opts.row)),
      find: jest.fn(async () => []),
      count: jest.fn(async () => opts.count ?? 0),
      save: jest.fn(async (e: AnswerReuse) => ({ ...e, id: 101 })),
      create: (e: Partial<AnswerReuse>) => e as AnswerReuse,
      update: jest.fn(),
      increment: jest.fn(),
      delete: jest.fn(),
    } as unknown as Repository<AnswerReuse>;
    const ai = {
      embed: jest.fn(async () => ({
        vectors: [[0.1, 0.2]],
        provider: opts.provider ?? 'voyage',
        model: 'voyage-4',
        tokensIn: 1,
        dimension: 2,
      })),
    } as unknown as AiGatewayService;
    const vector = {
      enabled: true,
      search: jest.fn(async () =>
        (opts.searchHits ?? []).map((h) => ({ ...h, payload: { tenant_id: 1, lang: 'KO', active: true } })),
      ),
      upsert: jest.fn(async () => undefined),
      setActive: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    } as unknown as ReuseQdrantService;
    return { svc: new AnswerReuseService(repo, ai, vector), repo, ai, vector };
  }

  const activeRow = (over: Partial<AnswerReuse> = {}): Partial<AnswerReuse> => ({
    id: 7,
    tenantId: 1,
    lang: 'KO',
    answerText: '영업일 기준 2~3일 내 출고됩니다.',
    source: 'agent',
    confidence: null,
    citations: null,
    active: 1,
    updatedAt: new Date(),
    ...over,
  });

  describe('lookup', () => {
    it('replays a near-duplicate question above the threshold', async () => {
      const { svc } = build({ searchHits: [{ id: 7, score: 0.95 }], row: activeRow() });
      const hit = await svc.lookup(1, 'KO', '배송은 얼마나 걸리나요?');
      expect(hit).toMatchObject({ reuseId: 7, text: '영업일 기준 2~3일 내 출고됩니다.' });
      expect(hit!.confidence).toBeGreaterThanOrEqual(0.9); // agent replay never escalates
    });

    it('misses below the similarity threshold (a lower bar reuses wrong answers)', async () => {
      const { svc } = build({ searchHits: [{ id: 7, score: 0.85 }], row: activeRow() });
      await expect(svc.lookup(1, 'KO', '립틴트 추천해주세요')).resolves.toBeNull();
    });

    it('never replays on stub embeddings (pseudo-vector similarity is noise)', async () => {
      const { svc, vector } = build({ provider: 'stub', searchHits: [{ id: 7, score: 0.99 }] });
      await expect(svc.lookup(1, 'KO', '배송은 얼마나 걸리나요?')).resolves.toBeNull();
      expect((vector.search as jest.Mock)).not.toHaveBeenCalled();
    });

    it('retires and skips an entry older than the TTL', async () => {
      const stale = activeRow({ updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60_000) });
      const { svc, repo, vector } = build({ searchHits: [{ id: 7, score: 0.95 }], row: stale });
      await expect(svc.lookup(1, 'KO', '배송은 얼마나 걸리나요?')).resolves.toBeNull();
      expect(repo.update).toHaveBeenCalledWith({ id: 7, tenantId: 1 }, { active: 0 });
      expect(vector.setActive).toHaveBeenCalledWith(7, false);
    });

    it('fails open: an embed error means LLM path, never a thrown error', async () => {
      const { svc, ai } = build({});
      (ai.embed as jest.Mock).mockRejectedValueOnce(new Error('down'));
      await expect(svc.lookup(1, 'KO', '배송은?')).resolves.toBeNull();
    });
  });

  describe('recordAiAnswer (D-C1 filters)', () => {
    const base = {
      tenantId: 1,
      lang: 'KO',
      question: '배송은 얼마나 걸리나요?',
      answerText: '영업일 기준 2~3일 내 출고되어 발송됩니다.',
      confidence: 0.9,
      citations: [{ id: 1 }],
      sourceMessageId: 55,
      needsOrderData: false,
    };

    it('stores a cited, confident, non-order answer and indexes its question', async () => {
      const { svc, repo, vector } = build({ searchHits: [] });
      await svc.recordAiAnswer(base);
      expect(repo.save).toHaveBeenCalled();
      expect(vector.upsert).toHaveBeenCalledWith(101, [0.1, 0.2], {
        tenant_id: 1,
        lang: 'KO',
        active: true,
      });
    });

    it.each([
      ['order-grounded answers are personal', { needsOrderData: true }],
      ['uncited answers are unverified', { citations: [] as unknown[] }],
      ['low confidence is not worth replaying', { confidence: 0.5 }],
    ])('refuses to store when %s', async (_why, override) => {
      const { svc, repo } = build({ searchHits: [] });
      await svc.recordAiAnswer({ ...base, ...override });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('skips a near-duplicate question (first answer wins; console edits it)', async () => {
      const { svc, repo } = build({ searchHits: [{ id: 3, score: 0.97 }] });
      await svc.recordAiAnswer(base);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('respects the per-tenant cap', async () => {
      const { svc, repo } = build({ searchHits: [], count: 2000 });
      await svc.recordAiAnswer(base);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('eraseByMessageIds (DSAR)', () => {
    it('deletes rows and their vector points', async () => {
      const { svc, repo, vector } = build({});
      (repo.find as jest.Mock).mockResolvedValueOnce([{ id: 4 }, { id: 9 }]);
      await svc.eraseByMessageIds(1, [55, 56]);
      expect(repo.delete).toHaveBeenCalled();
      expect(vector.delete).toHaveBeenCalledWith([4, 9]);
    });
  });

  /**
   * FIX-260813. Storage embedded questions as 'document' while lookup embedded
   * them as 'query'; Voyage returns a different vector per input_type, so the
   * same sentence scored 0.61 against itself and the store never replayed once.
   * The failure was silent — a miss just falls through to the LLM.
   */
  describe('embedding input_type (FIX-260813)', () => {
    it('embeds stored questions as a query, matching how lookup embeds them', async () => {
      const { svc, ai } = build({});
      await svc.recordAgentAnswer({
        tenantId: 1,
        lang: 'KO',
        question: '반품 배송비는 누가 부담하나요?',
        answerText: '고객님이 부담하시며 $6.95입니다.',
        sourceMessageId: 1,
      });
      const storeCall = (ai.embed as jest.Mock).mock.calls.at(-1);
      expect(storeCall?.[1]).toBe('query');
    });

    it('uses the same input_type on both sides, or nothing can ever match', async () => {
      const { svc, ai } = build({});
      await svc.lookup(1, 'KO', '반품 배송비는 누가 부담하나요?');
      const lookupType = (ai.embed as jest.Mock).mock.calls.at(-1)?.[1];
      (ai.embed as jest.Mock).mockClear();
      await svc.recordAgentAnswer({
        tenantId: 1,
        lang: 'KO',
        question: '반품 배송비는 누가 부담하나요?',
        answerText: '고객님이 부담하시며 $6.95입니다.',
        sourceMessageId: 1,
      });
      const storeType = (ai.embed as jest.Mock).mock.calls.at(-1)?.[1];
      expect(storeType).toBe(lookupType);
    });

    it('reindex re-embeds every row so pre-fix vectors stop being dead weight', async () => {
      const { svc, repo, vector } = build({});
      (repo.find as jest.Mock) = jest.fn(async () => [
        activeRow({ id: 1, questionText: 'a' }),
        activeRow({ id: 2, questionText: 'b' }),
      ]);
      const res = await svc.reindex(1);
      expect(res).toEqual({ total: 2, reindexed: 2, failed: 0 });
      expect((vector.upsert as jest.Mock).mock.calls.length).toBe(2);
    });
  });
});
