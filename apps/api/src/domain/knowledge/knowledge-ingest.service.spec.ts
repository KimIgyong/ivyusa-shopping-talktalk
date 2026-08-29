import { KnowledgeIngestService } from './knowledge-ingest.service';
import { KnowledgeIngestJobService, INGEST_STATUS } from './knowledge-ingest-job.service';

/** Draft analysis + approve semantics (PLN-260829 3차). */
describe('KnowledgeIngestService', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  function build(completeText: string | ((call: number) => string)) {
    let calls = 0;
    const boardCreated: Array<Record<string, unknown>> = [];
    const audited: Array<Record<string, unknown>> = [];
    const fileRepo = {
      create: (d: Record<string, unknown>) => d,
      save: jest.fn(async (d: Record<string, unknown>) => ({ id: 42, ...d })),
    };
    const ai = {
      complete: jest.fn(async () => ({
        text: typeof completeText === 'function' ? completeText(calls++) : completeText,
        tokensIn: 0,
        tokensOut: 0,
        provider: 'stub',
        model: 'stub-1',
      })),
    };
    const categories = {
      list: jest.fn(async () => [
        { name: 'faq', hidden: false },
        { name: '숨김', hidden: true },
      ]),
    };
    const revisions = {
      record: jest.fn(async () => null),
      recordAudit: jest.fn(async (_t: number, _d: number, _a: string, _u: unknown, meta: Record<string, unknown>) => {
        audited.push(meta);
      }),
    };
    const board = {
      create: jest.fn(async (_t: number, body: Record<string, unknown>) => {
        const row = { id: boardCreated.length + 1, ...body };
        boardCreated.push(row);
        return row;
      }),
    };
    const jobs = new KnowledgeIngestJobService();
    const config = { get: (_k: string, d: string) => d };
    const svc = new KnowledgeIngestService(
      fileRepo as never,
      ai as never,
      categories as never,
      revisions as never,
      board as never,
      jobs,
      config as never,
    );
    return { svc, jobs, boardCreated, audited, ai, board };
  }

  const CSV = Buffer.from('q,a\n환불되나요?,7일 이내 가능합니다', 'utf8');
  const file = { originalname: 'faq.csv', mimetype: 'text/csv', size: CSV.length, buffer: CSV };

  it('valid JSON output becomes drafts with categories from the model', async () => {
    const h = build('{"articles":[{"title":"환불 안내","category":"faq","content":"7일 이내 전액 환불"}]}');
    await h.svc.startFile(1, file, 'counsel');
    await flush();
    const job = h.jobs.get(1)!;
    expect(job.status).toBe(INGEST_STATUS.READY);
    expect(job.drafts).toEqual([
      { title: '환불 안내', category: 'faq', content: '7일 이내 전액 환불', fallback: false },
    ]);
    // Hidden categories stay out of the steering list handed to the model.
    const system = (h.ai.complete as jest.Mock).mock.calls[0][0].system as string;
    expect(system).toContain('faq');
    expect(system).not.toContain('숨김');
  });

  it('unreadable model output degrades to a whole-chunk fallback draft (P3-4)', async () => {
    const h = build('Sure! Here are the articles you asked for.');
    await h.svc.startFile(1, file, 'operation');
    await flush();
    const job = h.jobs.get(1)!;
    expect(job.status).toBe(INGEST_STATUS.READY);
    expect(job.drafts).toHaveLength(1);
    expect(job.drafts[0].fallback).toBe(true);
    expect(job.drafts[0].content).toContain('환불되나요?');
  });

  it('a second start while one runs is refused with the specific code', async () => {
    // complete never resolves → the first job stays running.
    const h = build('x');
    (h.ai.complete as jest.Mock).mockReturnValue(new Promise(() => undefined));
    await h.svc.startFile(1, file, 'counsel');
    await expect(h.svc.startFile(1, file, 'counsel')).rejects.toMatchObject({ errorCode: 'E5069' });
  });

  it('an unsupported extension fails the request, not the job', async () => {
    const h = build('x');
    await expect(
      h.svc.startFile(1, { ...file, originalname: 'x.hwp' }, 'counsel'),
    ).rejects.toMatchObject({ errorCode: 'E5066' });
    expect(h.jobs.get(1)).toBeNull();
  });

  it('approve publishes the reviewed drafts onto the board and consumes the job (B2 P4-6)', async () => {
    const h = build('{"articles":[{"title":"환불 안내","category":"faq","content":"본문"}]}');
    await h.svc.startFile(1, file, 'operation');
    await flush();

    const result = await h.svc.approve(
      1,
      [{ title: '환불 안내(수정)', category: '정책', content: '검수된 본문' }],
      7,
    );

    expect(result).toMatchObject({ saved: 1, target: 'board', docGroup: 'operation' });
    expect(h.boardCreated[0]).toMatchObject({
      doc_group: 'operation',
      category1: '정책',
      title: '환불 안내(수정)',
      status: 'published',
      tags: ['ai-import'],
    });
    expect(h.audited[0]).toMatchObject({ saved: 1, target: 'board' });
    expect(h.jobs.get(1)!.status).toBe(INGEST_STATUS.CONSUMED);
    // A second approve of the consumed job must refuse — it would duplicate.
    await expect(h.svc.approve(1, [{ title: 'x', category: 'y', content: 'z' }], 7)).rejects.toThrow();
  });

  it('approve with an incomplete article rejects before anything is written', async () => {
    const h = build('{"articles":[{"title":"t","category":"c","content":"b"}]}');
    await h.svc.startFile(1, file, 'counsel');
    await flush();
    await expect(
      h.svc.approve(1, [{ title: '', category: 'faq', content: 'x' }], 7),
    ).rejects.toThrow();
    expect(h.boardCreated).toHaveLength(0);
  });
});
