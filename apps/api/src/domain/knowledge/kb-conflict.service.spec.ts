import { Repository } from 'typeorm';
import { MODERATION_DECISION } from '@ivy/types';
import { KbConflictService, isStale } from './kb-conflict.service';
import { KbDocument } from './entity/kb-document.entity';
import { KbConflict } from './entity/kb-conflict.entity';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { ModerationService } from '../moderation/moderation.service';

const doc = (id: number, title: string, content: string): KbDocument =>
  ({ id, tenantId: 1, title, content, active: 1, source: 'knowledge_store' }) as KbDocument;

describe('KbConflictService.scan', () => {
  const docs = [
    doc(10, 'Shipping fee', 'Free shipping on orders over $29.99.'),
    doc(20, 'FAQ: free shipping', 'Free shipping on orders over $19.99.'),
  ];

  let saved: Array<Partial<KbConflict>>;
  let judgeCalls: number;

  const build = (
    opts: {
      hits?: Array<{ id: number; score: number }>;
      known?: Array<Partial<KbConflict>>;
      judgeText?: string;
      qdrantEnabled?: boolean;
      moderationBlocks?: boolean;
    } = {},
  ) => {
    saved = [];
    judgeCalls = 0;

    const docRepo = {
      find: jest.fn(async () => docs),
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
      embed: jest.fn(async () => ({
        vectors: [[1, 0, 0]],
        model: 'voyage-4',
        provider: 'voyage',
        tokensIn: 1,
        dimension: 3,
      })),
      complete: jest.fn(async () => {
        judgeCalls += 1;
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

    return { svc: new KbConflictService(docRepo, conflictRepo, qdrant, ai, moderation), docRepo };
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

  it('stores nothing when the verdict is unparseable (stub adapter, rate limit)', async () => {
    const { svc } = build({ judgeText: 'I think these are similar.' });
    const r = await svc.scan(1);
    expect(r.judged).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('rejects a verdict outside the allowed set', async () => {
    const { svc } = build({ judgeText: '{"verdict":"maybe","rationale":"unsure"}' });
    await svc.scan(1);
    expect(saved).toHaveLength(0);
  });

  it('drops a rationale the moderation gate blocks (POL-020)', async () => {
    const { svc } = build({ moderationBlocks: true });
    await svc.scan(1);
    expect(saved).toHaveLength(0);
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
