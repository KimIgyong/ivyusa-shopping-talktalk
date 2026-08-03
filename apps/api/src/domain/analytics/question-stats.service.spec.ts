import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { QuestionStatsService, cosine, mergeCentroid } from './question-stats.service';
import { Message } from '../chat/entity/message.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { KbDocument } from '../knowledge/entity/kb-document.entity';
import { QuestionStatDaily } from './entity/question-stat-daily.entity';
import { QuestionCluster } from './entity/question-cluster.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';

const vec = (seed: number, dim = 8): number[] =>
  Array.from({ length: dim }, (_, i) => Math.sin(seed + i));

describe('QuestionStatsService.aggregateDay (4 lenses)', () => {
  const questions = [
    {
      id: 1,
      tenantId: 1,
      conversationId: 77,
      senderType: 'user',
      body: 'How much is return shipping?',
      lang: 'en',
      intent: 'return_inquiry',
      retrievalTrace: null,
    },
    {
      id: 2,
      tenantId: 1,
      conversationId: 78,
      senderType: 'user',
      body: 'Where is my parcel?',
      lang: 'en',
      intent: 'shipping_inquiry',
      retrievalTrace: null,
    },
    // Unattributable: skipped rather than folded into another tenant's numbers.
    {
      id: 3,
      tenantId: null,
      conversationId: 79,
      senderType: 'user',
      body: 'orphan question',
      lang: 'en',
      intent: 'other',
      retrievalTrace: null,
    },
  ] as unknown as Message[];

  const aiTurns = [
    {
      id: 11,
      conversationId: 77,
      senderType: 'ai',
      retrievalTrace: { citations: [{ id: 54 }], confidence: 0.56 },
    },
    // No citation → counts toward no_source, the "knowledge gap" signal.
    { id: 12, conversationId: 78, senderType: 'ai', retrievalTrace: { citations: [], confidence: 0.3 } },
  ] as unknown as Message[];

  let upserted: Array<Record<string, unknown>>;
  let savedClusters: QuestionCluster[];
  let embedCalls: string[][];

  const build = (opts: { clusters?: QuestionCluster[]; embedFails?: boolean } = {}) => {
    upserted = [];
    savedClusters = [];
    embedCalls = [];

    const msgRepo = {
      find: jest.fn(async (o: { where: { senderType: string } }) =>
        o.where.senderType === 'user' ? questions : aiTurns,
      ),
    } as unknown as Repository<Message>;
    const convRepo = {
      find: jest.fn(async () => [{ id: 78 }] as Conversation[]), // 78 escalated
    } as unknown as Repository<Conversation>;
    const kbRepo = {
      find: jest.fn(async () => [
        { id: 54, title: '2.2.2 Return shipping', category: 'policy_return' } as KbDocument,
      ]),
    } as unknown as Repository<KbDocument>;
    const statRepo = {
      upsert: jest.fn(async (rows: Array<Record<string, unknown>>) => {
        upserted.push(...rows);
      }),
    } as unknown as Repository<QuestionStatDaily>;

    let clusterId = 900;
    const clusterRepo = {
      find: jest.fn(async () => opts.clusters ?? []),
      create: (c: Partial<QuestionCluster>) => c as QuestionCluster,
      save: jest.fn(async (c: QuestionCluster) => {
        const withId = { ...c, id: c.id ?? clusterId++ } as QuestionCluster;
        savedClusters.push(withId);
        return withId;
      }),
    } as unknown as Repository<QuestionCluster>;

    const ai = {
      embed: jest.fn(async (texts: string[]) => {
        embedCalls.push(texts);
        if (opts.embedFails) throw new Error('voyage 429');
        return {
          vectors: texts.map((_, i) => vec(i)),
          model: opts.stubProvider ? 'stub-1' : 'voyage-4',
          provider: opts.stubProvider ? 'stub' : 'voyage',
          tokensIn: 1,
          dimension: 8,
        };
      }),
    } as unknown as AiGatewayService;

    return new QuestionStatsService(msgRepo, convRepo, kbRepo, statRepo, clusterRepo, ai, {
      get: () => 0, // scheduler off in tests
    } as unknown as ConfigService);
  };

  const rowsFor = (dimension: string) => upserted.filter((r) => r.dimension === dimension);

  it('counts the intent lens from the label stored on each question', async () => {
    const svc = build();
    await svc.aggregateDay('2026-08-04');
    const intents = rowsFor('intent').map((r) => r.dimKey);
    expect(intents).toEqual(expect.arrayContaining(['return_inquiry', 'shipping_inquiry']));
  });

  it('counts document and category lenses from stored citations (no new collection)', async () => {
    const svc = build();
    await svc.aggregateDay('2026-08-04');
    expect(rowsFor('document')[0]).toMatchObject({ dimKey: '54', dimLabel: '2.2.2 Return shipping' });
    expect(rowsFor('category')[0]).toMatchObject({ dimKey: 'policy_return' });
  });

  it('counts the keyword lens', async () => {
    const svc = build();
    await svc.aggregateDay('2026-08-04');
    expect(rowsFor('keyword').map((r) => r.dimKey)).toEqual(expect.arrayContaining(['return', 'shipping']));
  });

  it('flags escalation and missing sources per bucket', async () => {
    const svc = build();
    await svc.aggregateDay('2026-08-04');
    const shipping = rowsFor('intent').find((r) => r.dimKey === 'shipping_inquiry')!;
    expect(shipping.escalated).toBe(1); // conversation 78 escalated
    expect(shipping.noSource).toBe(1); // its AI turn cited nothing
    const ret = rowsFor('intent').find((r) => r.dimKey === 'return_inquiry')!;
    expect(ret.escalated).toBe(0);
    expect(ret.noSource).toBe(0);
  });

  it('skips questions with no tenant rather than attributing them to someone', async () => {
    const svc = build();
    const result = await svc.aggregateDay('2026-08-04');
    expect(result.questions).toBe(2);
    expect(upserted.every((r) => r.tenantId === 1)).toBe(true);
  });

  it('creates clusters for questions that match nothing yet', async () => {
    const svc = build();
    const result = await svc.aggregateDay('2026-08-04');
    expect(result.clustersCreated).toBe(2);
    expect(rowsFor('cluster')).toHaveLength(2);
  });

  it('joins an existing cluster when similarity clears the threshold', async () => {
    // Centroid identical to the first question's embedding → cosine 1.0.
    const existing = [{ id: 500, tenantId: 1, label: 'returns', centroid: vec(0), size: 3 }] as QuestionCluster[];
    const svc = build({ clusters: existing });
    const result = await svc.aggregateDay('2026-08-04');
    expect(rowsFor('cluster').some((r) => r.dimKey === '500')).toBe(true);
    expect(result.clustersCreated).toBeLessThan(2);
  });

  it('still produces the other three lenses when embedding fails', async () => {
    // A Voyage outage must not cost the whole day's snapshot.
    const svc = build({ embedFails: true });
    await svc.aggregateDay('2026-08-04');
    expect(rowsFor('cluster')).toHaveLength(0);
    expect(rowsFor('intent').length).toBeGreaterThan(0);
    expect(rowsFor('keyword').length).toBeGreaterThan(0);
  });

  it('refuses stub vectors when a real embedding key is configured', async () => {
    // The gateway degrades to the deterministic stub on any provider error — a
    // 429 is enough — and stub vectors share no space with real ones. Accepting
    // them seeds permanent centroids nothing ever matches. Observed on staging
    // during the 2026-08-04 backfill.
    const previous = process.env.VOYAGE_API_KEY;
    process.env.VOYAGE_API_KEY = 'test-key';
    try {
      const svc = build({ stubProvider: true });
      await svc.aggregateDay('2026-08-04');
      expect(rowsFor('cluster')).toHaveLength(0);
      // The other three lenses still produce a snapshot.
      expect(rowsFor('intent').length).toBeGreaterThan(0);
      expect(rowsFor('keyword').length).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.VOYAGE_API_KEY;
      else process.env.VOYAGE_API_KEY = previous;
    }
  });

  it('accepts stub vectors in a keyless deployment (local dev)', async () => {
    const previous = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    try {
      const svc = build({ stubProvider: true });
      await svc.aggregateDay('2026-08-04');
      expect(rowsFor('cluster').length).toBeGreaterThan(0);
    } finally {
      if (previous !== undefined) process.env.VOYAGE_API_KEY = previous;
    }
  });

  it('upserts on (tenant, date, dimension, key) so a re-run cannot double-count', async () => {
    const svc = build();
    await svc.aggregateDay('2026-08-04');
    const statRepo = (svc as unknown as { statRepo: { upsert: jest.Mock } }).statRepo;
    expect(statRepo.upsert.mock.calls[0][1]).toMatchObject({
      conflictPaths: ['tenantId', 'statDate', 'dimension', 'dimKey'],
    });
  });

  it('scrubs PII from cluster labels before they outlive the retention purge', async () => {
    const withEmail = [
      {
        id: 4,
        tenantId: 1,
        conversationId: 80,
        senderType: 'user',
        body: 'refund to jane.doe@example.com please',
        lang: 'en',
        intent: 'refund',
        retrievalTrace: null,
      },
    ] as unknown as Message[];
    questions.push(...withEmail);
    const svc = build();
    await svc.aggregateDay('2026-08-04');
    questions.pop();
    const labels = savedClusters.map((c) => c.label ?? '');
    expect(labels.some((l) => l.includes('jane.doe@example.com'))).toBe(false);
    // The embedding input is scrubbed too — customer contact details never
    // leave for the vector provider.
    expect(embedCalls.flat().some((t) => t.includes('jane.doe@example.com'))).toBe(false);
  });

  it('returns an empty result for a day with no questions', async () => {
    const svc = build();
    const drained = questions.splice(0, questions.length);
    const result = await svc.aggregateDay('2026-08-04');
    questions.push(...drained);
    expect(result).toMatchObject({ questions: 0, rows: 0, clustersCreated: 0 });
  });
});

describe('cluster maths', () => {
  it('cosine is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('cosine returns 0 rather than NaN for a zero vector or a length mismatch', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 0, 0], [1, 0])).toBe(0);
  });

  it('merging moves the centroid by 1/(n+1) toward the new member', () => {
    // size 1: the mean of the two vectors.
    expect(mergeCentroid([0, 0], [2, 4], 1)).toEqual([1, 2]);
    // A large cluster barely moves.
    const merged = mergeCentroid([0, 0], [10, 10], 99);
    expect(merged[0]).toBeCloseTo(0.1);
  });
});
