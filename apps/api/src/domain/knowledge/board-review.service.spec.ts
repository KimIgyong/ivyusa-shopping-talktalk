import { BoardReviewService } from './board-review.service';
import { BoardDocument } from '../board/entity/board-document.entity';
import { KbDocument } from './entity/kb-document.entity';

describe('BoardReviewService', () => {
  const boardDoc = (over: Partial<BoardDocument> = {}): BoardDocument =>
    ({
      id: 5,
      tenantId: 1,
      boardId: 1,
      docGroup: 'operation',
      category1: '객실 운영',
      category2: '잠금',
      title: '긴급 차단 절차',
      content: '절차 본문',
      status: 'published',
      promotedDocumentId: null,
      ...over,
    }) as BoardDocument;

  function build(opts: { doc?: Partial<BoardDocument>; kb?: Partial<KbDocument>[]; golden?: number } = {}) {
    const doc = boardDoc(opts.doc);
    const kbRows: Partial<KbDocument>[] = [...(opts.kb ?? [])];
    const savedBoard: Array<Partial<BoardDocument>> = [];
    const ensured: Array<[string, string]> = [];
    const audited: Array<{ action: string; meta: Record<string, unknown> }> = [];
    let ragCalls: Array<unknown[]> = [];

    const boardRepo = {
      findOne: jest.fn(async () => doc),
      save: jest.fn(async (d: BoardDocument) => {
        savedBoard.push({ ...d });
        return d;
      }),
    };
    const kbRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        kbRows.find((k) => k.externalKey === where.externalKey) ?? null),
      create: (d: Partial<KbDocument>) => d as KbDocument,
      save: jest.fn(async (d: KbDocument) => {
        const row = { id: d.id ?? 900, ...d } as KbDocument;
        if (d.id == null) kbRows.push(row);
        return row;
      }),
    };
    const goldenRepo = {
      find: jest.fn(async () =>
        Array.from({ length: opts.golden ?? 0 }, (_, i) => ({
          id: i + 1,
          question: `골든 질문 ${i + 1}`,
          language: 'KO',
        })),
      ),
    };
    const categories = {
      ensure: jest.fn(async (_t: number, name: string, _o: string, group: string) => {
        ensured.push([name, group]);
      }),
    };
    const revisions = {
      record: jest.fn(async () => null),
      recordAudit: jest.fn(async (_t: number, _d: number, action: string, _u: unknown, meta: any) => {
        audited.push({ action, meta });
      }),
    };
    const knowledge = {
      embedDocuments: jest.fn(async (docs: KbDocument[]) => ({ embedded: docs.length, failed: 0 })),
    };
    const rag = {
      answer: jest.fn(async (...args: unknown[]) => {
        ragCalls.push(args);
        const withCandidate = Array.isArray(args[7]) && (args[7] as unknown[]).length > 0;
        return {
          text: '시뮬레이션 답변',
          confidence: withCandidate ? 0.8 : 0.4,
          citations: withCandidate
            ? [{ id: -1, title: doc.title, category: '잠금', snippet: 's', similarity: 0.7, candidate: true }]
            : [],
          candidateResults: withCandidate
            ? [{ id: -1, title: doc.title, similarity: 0.7, candidate: true }]
            : undefined,
          tokensIn: 0,
          tokensOut: 0,
        };
      }),
    };
    const moderation = {
      moderate: jest.fn(async ({ text }: { text: string }) => ({ decision: 'allowed', text })),
    };
    const svc = new BoardReviewService(
      boardRepo as never,
      kbRepo as never,
      goldenRepo as never,
      categories as never,
      revisions as never,
      knowledge as never,
      rag as never,
      moderation as never,
    );
    return { svc, doc, kbRows, savedBoard, ensured, audited, knowledge, rag, get ragCalls() { return ragCalls; } };
  }

  it('promote creates the BRD-keyed KB doc, maps category 2nd-level-first, embeds, and flips the board row', async () => {
    const h = build();
    const res = await h.svc.promote(1, 5, {}, 7);
    expect(res).toMatchObject({ embedded: 1, category: '잠금' });
    expect(h.kbRows[0]).toMatchObject({
      externalKey: 'BRD-5',
      source: 'board',
      docGroup: 'operation',
      category: '잠금',
      status: 'pending',
    });
    expect(h.ensured).toEqual([['잠금', 'operation']]);
    expect(h.savedBoard[0]).toMatchObject({ status: 'promoted', promotedDocumentId: 900 });
    expect(h.audited[0].action).toBe('board.document_promoted');
  });

  it('re-promote updates the same key in place — never a duplicate', async () => {
    const h = build({
      doc: { status: 'promoted', promotedDocumentId: 900 },
      kb: [{ id: 900, externalKey: 'BRD-5', title: '옛 제목', content: '옛 본문', category: '잠금' }],
    });
    await h.svc.promote(1, 5, {}, 7);
    expect(h.kbRows).toHaveLength(1);
    expect(h.kbRows[0]).toMatchObject({ id: 900, title: '긴급 차단 절차', content: '절차 본문', status: 'pending' });
  });

  it('promote honors an explicit category override', async () => {
    const h = build();
    const res = await h.svc.promote(1, 5, { category: '긴급 대응' }, 7);
    expect(res).toMatchObject({ category: '긴급 대응' });
  });

  it('draft and rejected documents cannot be promoted; only published can be rejected', async () => {
    await expect(build({ doc: { status: 'draft' } }).svc.promote(1, 5, {}, 7)).rejects.toThrow();
    await expect(build({ doc: { status: 'rejected' } }).svc.promote(1, 5, {}, 7)).rejects.toThrow();
    await expect(build({ doc: { status: 'draft' } }).svc.reject(1, 5, 7)).rejects.toThrow();
    const h = build({ doc: { status: 'promoted' } });
    await h.svc.reopen(1, 5, 7);
    expect(h.savedBoard[0]).toMatchObject({ status: 'published' });
  });

  it('simulate injects the candidate, keeps the moderation gate, and reports similarity even when uncited', async () => {
    const h = build();
    const res = await h.svc.simulate(1, 5, '긴급 시 어떻게 차단하나요?', 'KO');
    expect(res).toMatchObject({
      confidence: 0.8,
      blocked: false,
      candidateCited: true,
      candidateSimilarity: 0.7,
    });
    // The candidate rode as the 8th positional argument of rag.answer.
    expect(Array.isArray(h.ragCalls[0][7])).toBe(true);
    expect((h.ragCalls[0][7] as any)[0]).toMatchObject({ title: '긴급 차단 절차', group: 'operation', category: '잠금' });
  });

  it('golden A/B runs each question twice and aggregates Δconfidence and citations', async () => {
    const h = build({ golden: 3 });
    const res = (await h.svc.simulateGolden(1, 5)) as any;
    expect(res.items).toHaveLength(3);
    expect(res.items[0]).toMatchObject({ baseConfidence: 0.4, withConfidence: 0.8, delta: 0.4, candidateCited: true });
    expect(res.summary).toMatchObject({ questions: 3, cited: 3, avgDelta: 0.4 });
    // 2 rag calls per question.
    expect(h.ragCalls).toHaveLength(6);
  });

  it('golden A/B refuses when the tenant has no golden questions', async () => {
    await expect(build({ golden: 0 }).svc.simulateGolden(1, 5)).rejects.toMatchObject({ errorCode: 'E4017' });
  });
});
