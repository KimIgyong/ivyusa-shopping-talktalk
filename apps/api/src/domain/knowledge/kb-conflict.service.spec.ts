import { Repository } from 'typeorm';
import { MODERATION_DECISION } from '@ivy/types';
import { KbConflictService, isStale } from './kb-conflict.service';
import { KbDocument } from './entity/kb-document.entity';
import { KbConflict } from './entity/kb-conflict.entity';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ModerationService } from '../moderation/moderation.service';
import { AuditService } from '../audit/audit.service';

const doc = (id: number, title: string, content: string, docGroup = 'counsel'): KbDocument =>
  ({ id, tenantId: 1, title, content, active: 1, source: 'knowledge_store', docGroup }) as KbDocument;

describe('KbConflictService.scan', () => {
  const docs = [
    doc(10, 'Shipping fee', 'Free shipping on orders over $29.99.'),
    doc(20, 'FAQ: free shipping', 'Free shipping on orders over $19.99.'),
  ];

  let saved: Array<Partial<KbConflict>>;
  let judgeCalls: number;
  let embedCalls: number;

  const build = (
    opts: {
      hits?: Array<{ id: number; score: number }>;
      known?: Array<Partial<KbConflict>>;
      judgeText?: string;
      qdrantEnabled?: boolean;
      moderationBlocks?: boolean;
      stubProvider?: boolean;
      judgeThrows?: boolean;
      docs?: KbDocument[];
    } = {},
  ) => {
    saved = [];
    judgeCalls = 0;
    embedCalls = 0;

    const docRepo = {
      find: jest.fn(async () => opts.docs ?? docs),
      update: jest.fn(),
      findOne: jest.fn(async () => docs[0]),
    } as unknown as Repository<KbDocument>;

    const conflictRepo = {
      find: jest.fn(async () => (opts.known ?? []) as KbConflict[]),
      create: (c: Partial<KbConflict>) => c as KbConflict,
      save: jest.fn(async (c: KbConflict) => {
        saved.push(c);
        return c;
      }),
      findOne: jest.fn(async () => ({ id: 1, tenantId: 1, docAId: 10, docBId: 20 }) as KbConflict),
    } as unknown as Repository<KbConflict>;

    const qdrant = {
      enabled: opts.qdrantEnabled ?? true,
      search: jest.fn(async () => opts.hits ?? [{ id: 20, score: 0.91 }]),
    } as unknown as QdrantService;

    const ai = {
      embed: jest.fn(async (texts: string[]) => {
        embedCalls += 1;
        return {
          vectors: texts.map(() => [1, 0, 0]),
          model: opts.stubProvider ? 'stub-1' : 'voyage-4',
          provider: opts.stubProvider ? 'stub' : 'voyage',
          tokensIn: 1,
          dimension: 3,
        };
      }),
      complete: jest.fn(async () => {
        judgeCalls += 1;
        if (opts.judgeThrows) throw new Error('provider 500');
        return {
          text:
            opts.judgeText ??
            '{"verdict":"conflict","rationale":"Free shipping threshold differs: $29.99 vs $19.99."}',
        };
      }),
    } as unknown as AiGatewayService;

    const moderation = {
      moderate: jest.fn(async ({ text }: { text: string }) => ({
        decision: opts.moderationBlocks ? MODERATION_DECISION.BLOCKED : MODERATION_DECISION.DELIVERED,
        text,
      })),
    } as unknown as ModerationService;

    const audit = { write: jest.fn(async () => undefined) } as unknown as AuditService;
    return {
      svc: new KbConflictService(docRepo, conflictRepo, qdrant, ai, moderation, audit),
      docRepo,
      audit,
    };
  };

  it('queues a contradicting pair with the model verdict and rationale', async () => {
    // Similarity alone cannot tell agreement from contradiction: these two
    // sentences are near-identical vectors and mutually exclusive facts.
    const { svc } = build();
    const r = await svc.scan(1);
    expect(r.candidates).toBe(1);
    expect(r.conflicts).toBe(1);
    expect(saved[0]).toMatchObject({
      docAId: 10,
      docBId: 20,
      verdict: 'conflict',
      status: 'pending',
    });
    expect(saved[0].rationale).toContain('$29.99');
  });

  it('stores a pair once, lower id first, whichever direction it was found from', async () => {
    const { svc } = build();
    await svc.scan(1);
    expect(saved).toHaveLength(1);
    expect(Number(saved[0].docAId)).toBeLessThan(Number(saved[0].docBId));
  });

  it('never pairs documents from different groups', async () => {
    // A product description and a refund policy are never the same claim, and
    // pairing them floods the queue the moment a catalogue is imported.
    const mixed = [
      doc(10, 'Shipping fee', 'Free shipping over $29.99.', 'counsel'),
      doc(20, 'Collagen mask', 'Free shipping over $19.99.', 'product'),
    ];
    const { svc } = build({ docs: mixed });
    const r = await svc.scan(1);
    expect(r.candidates).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('ignores neighbours below the candidate threshold', async () => {
    const { svc } = build({ hits: [{ id: 20, score: 0.4 }] });
    const r = await svc.scan(1);
    expect(r.candidates).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('skips pairs already recorded, including dismissed ones', async () => {
    // A reviewer's "not a conflict" has to stick, or the queue refills forever.
    const { svc } = build({ known: [{ docAId: 10, docBId: 20, status: 'dismissed' }] });
    const r = await svc.scan(1);
    expect(r.candidates).toBe(0);
    expect(judgeCalls).toBe(0);
  });

  it('records an unparseable response as a failed pair instead of silently dropping it', async () => {
    // Dropping it meant the same pair was re-judged on every scan, forever, with
    // nothing on screen to say why it never appeared (measured: 11 pairs, ~11
    // wasted model calls per run).
    const { svc } = build({ judgeText: 'I think these are similar.' });
    const r = await svc.scan(1);
    expect(r.judged).toBe(0);
    expect(r.failed).toBe(1);
    expect(saved[0]).toMatchObject({
      status: 'failed',
      failureReason: 'parse_fail',
      verdict: null,
      attempts: 1,
    });
  });

  it('records a verdict outside the allowed set as a failed pair', async () => {
    const { svc } = build({ judgeText: '{"verdict":"maybe","rationale":"unsure"}' });
    await svc.scan(1);
    expect(saved[0]).toMatchObject({ status: 'failed', failureReason: 'bad_verdict' });
  });

  it('records a model error as a failed pair', async () => {
    const { svc } = build({ judgeThrows: true });
    const r = await svc.scan(1);
    expect(r.failed).toBe(1);
    expect(saved[0]).toMatchObject({ status: 'failed', failureReason: 'model_error' });
  });

  it('keeps the verdict and withholds only the rationale when moderation blocks it', async () => {
    // The verdict is a three-value enum and cannot violate a content rule.
    // Discarding the whole judgement over its explanatory sentence lost the
    // "these two contradict" signal entirely (REQ-260804 §1-1).
    const { svc } = build({ moderationBlocks: true });
    const r = await svc.scan(1);
    expect(r.judged).toBe(1);
    expect(r.withheld).toBe(1);
    expect(r.failed).toBe(0);
    expect(saved[0]).toMatchObject({
      status: 'pending',
      verdict: 'conflict',
      rationale: null,
      rationaleWithheld: 1,
    });
  });

  it('re-judges a failed pair while it has retries left, and stops after the budget', async () => {
    const withinBudget = build({
      known: [{ id: 9, docAId: 10, docBId: 20, status: 'failed', attempts: 1 }],
      judgeText: '{"verdict":"duplicate","rationale":"same content"}',
    });
    const r1 = await withinBudget.svc.scan(1);
    expect(r1.candidates).toBe(1);
    // Updates the existing row rather than inserting a duplicate pair.
    expect(saved[0]).toMatchObject({ id: 9, status: 'pending', verdict: 'duplicate', attempts: 2 });

    const exhausted = build({
      known: [{ id: 9, docAId: 10, docBId: 20, status: 'failed', attempts: 3 }],
    });
    const r2 = await exhausted.svc.scan(1);
    expect(r2.candidates).toBe(0);
  });

  it('never re-judges a pair a reviewer dismissed, however it was stored', async () => {
    const { svc } = build({ known: [{ docAId: 10, docBId: 20, status: 'dismissed', attempts: 1 }] });
    expect((await svc.scan(1)).candidates).toBe(0);
    expect(judgeCalls).toBe(0);
  });

  it('embeds documents in one batched call, not one request per document', async () => {
    // A 230-document knowledge base was 230 requests, and the adapter does not
    // retry single-text requests (that guard keeps live chat from stalling on a
    // rate-limit backoff), so the per-document loop failed en masse the moment
    // Voyage throttled — observed on staging 2026-08-04.
    const { svc } = build();
    await svc.scan(1);
    expect(embedCalls).toBe(1);
  });

  it('aborts the scan rather than scanning against stub vectors', async () => {
    const previous = process.env.VOYAGE_API_KEY;
    process.env.VOYAGE_API_KEY = 'test-key';
    try {
      const { svc } = build({ stubProvider: true });
      expect(await svc.scan(1)).toMatchObject({ candidates: 0, judged: 0 });
      expect(saved).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.VOYAGE_API_KEY;
      else process.env.VOYAGE_API_KEY = previous;
    }
  });

  it('does nothing when vector search is unavailable', async () => {
    const { svc } = build({ qdrantEnabled: false });
    expect(await svc.scan(1)).toMatchObject({ scanned: 0, candidates: 0 });
  });

  it('resolving hides the losing document and marks it superseded', async () => {
    // Display alone would not change answers — the retriever honours `active`,
    // so the decision has to land there (PLN D6).
    const { svc, docRepo } = build();
    await svc.resolve(1, 1, 'kept_a', 7);
    expect(docRepo.update).toHaveBeenCalledWith(
      { id: 20, tenantId: 1 },
      { active: 0, supersededBy: 10 },
    );
  });

  it('records who resolved a conflict and how', async () => {
    // Hiding a document because of a conflict is a knowledge change like any
    // other; it belongs in the same trail as an edit.
    const { svc, audit } = build();
    await svc.resolve(1, 1, 'kept_a', 7);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'knowledge.conflict_resolved',
        actorId: 7,
        metadata: expect.objectContaining({ resolution: 'kept_a' }),
      }),
    );
  });

  it('keeping both leaves visibility untouched', async () => {
    const { svc, docRepo } = build();
    await svc.resolve(1, 1, 'kept_both', 7);
    expect(docRepo.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown resolution', async () => {
    const { svc } = build();
    await expect(svc.resolve(1, 1, 'delete_everything', 7)).rejects.toThrow();
  });
});

describe('isStale', () => {
  const now = new Date('2026-08-04T00:00:00Z');

  it('is false when no review cadence is set', () => {
    expect(isStale({ reviewIntervalDays: null, updatedAt: new Date('2020-01-01') } as KbDocument, now)).toBe(false);
  });

  it('is true once the review interval has elapsed since the last review', () => {
    expect(
      isStale(
        { reviewIntervalDays: 30, reviewedAt: new Date('2026-06-01T00:00:00Z') } as KbDocument,
        now,
      ),
    ).toBe(true);
  });

  it('is false inside the interval', () => {
    expect(
      isStale(
        { reviewIntervalDays: 180, reviewedAt: new Date('2026-07-30T00:00:00Z') } as KbDocument,
        now,
      ),
    ).toBe(false);
  });

  it('falls back to updatedAt when the document was never reviewed', () => {
    // A document nobody has revisited since writing it is exactly the case
    // worth flagging.
    expect(
      isStale(
        { reviewIntervalDays: 30, reviewedAt: null, updatedAt: new Date('2026-01-01T00:00:00Z') } as KbDocument,
        now,
      ),
    ).toBe(true);
  });

  it('treats a non-positive interval as no cadence rather than always-stale', () => {
    expect(isStale({ reviewIntervalDays: 0, updatedAt: new Date('2020-01-01') } as KbDocument, now)).toBe(false);
  });
});
