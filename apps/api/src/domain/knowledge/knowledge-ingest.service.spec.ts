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
      findOne: jest.fn(async () => null),
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
    const attachments = {
      addLink: jest.fn(async () => ({})),
      attachSharedCopy: jest.fn(async (_t: number, ids: number[]) => ids.length),
    };
    const jobs = new KnowledgeIngestJobService();
    const config = { get: (_k: string, d: string) => d };
    const svc = new KnowledgeIngestService(
      fileRepo as never,
      ai as never,
      categories as never,
      revisions as never,
      board as never,
      attachments as never,
      jobs,
      config as never,
    );
    return { svc, jobs, boardCreated, audited, ai, board, attachments, fileRepo };
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

  it('a markdown upload passes the extension gate and analyzes as markdown', async () => {
    const h = build('{"articles":[{"title":"체크인","category":"faq","content":"오후 3시부터"}]}');
    const md = Buffer.from('# 체크인 안내\n\n오후 3시부터입니다', 'utf8');
    await h.svc.startFile(
      1,
      { originalname: 'manual.md', mimetype: 'text/markdown', size: md.length, buffer: md },
      'operation',
    );
    await flush();
    const job = h.jobs.get(1)!;
    expect(job.status).toBe(INGEST_STATUS.READY);
    expect(job.sourceLabel).toBe('manual.md');
    // The chunk handed to the model still carries the markdown heading.
    const prompt = (h.ai.complete as jest.Mock).mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('# 체크인 안내');
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
    // fileRepo.findOne resolves nothing here → no original to attach, quietly 0.
    expect(result).toMatchObject({ attachedOriginals: 0 });
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

  it('approve attaches ONE shared copy of the file original to every document (B4 P6-6)', async () => {
    const os = jest.requireActual('os') as typeof import('os');
    const fsp = jest.requireActual('fs/promises') as typeof import('fs/promises');
    const path = jest.requireActual('path') as typeof import('path');
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ingest-attach-'));
    await fsp.mkdir(path.join(root, 'kb-ingest', '1'), { recursive: true });
    await fsp.writeFile(path.join(root, 'kb-ingest', '1', 'orig.csv'), CSV);

    const h = build(
      '{"articles":[{"title":"A","category":"faq","content":"a"},{"title":"B","category":"faq","content":"b"}]}',
    );
    (h.fileRepo.findOne as jest.Mock).mockResolvedValue({
      filename: 'faq.csv',
      mime: 'text/csv',
      storagePath: path.join('kb-ingest', '1', 'orig.csv'),
    });
    // Route UPLOAD_DIR at the temp root so the real original bytes are read.
    const svc = h.svc as unknown as { config: { get: (k: string, d: string) => string } };
    svc.config = { get: (k: string, d: string) => (k === 'UPLOAD_DIR' ? root : d) };

    await h.svc.startFile(1, file, 'counsel');
    await flush();
    const result = await h.svc.approve(
      1,
      [
        { title: 'A', category: 'faq', content: 'a' },
        { title: 'B', category: 'faq', content: 'b' },
      ],
      7,
    );
    expect(result).toMatchObject({ saved: 2, attachedOriginals: 2 });
    expect(h.attachments.attachSharedCopy).toHaveBeenCalledTimes(1);
    const [, ids, source] = (h.attachments.attachSharedCopy as jest.Mock).mock.calls[0];
    expect(ids).toEqual([1, 2]);
    expect(source).toMatchObject({ filename: 'faq.csv', mime: 'text/csv' });
    expect(Buffer.isBuffer(source.buffer)).toBe(true);
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('a youtube source links the video URL onto every approved document', async () => {
    const h = build('{"articles":[{"title":"영상 요약","category":"faq","content":"본문"}]}');
    h.jobs.start(
      1,
      {
        sourceLabel: '설정 안내 영상',
        sourceKind: 'youtube',
        docGroup: 'operation',
        fileId: null,
        sourceUrl: 'https://youtu.be/abc123',
      },
      async () => [{ title: '영상 요약', category: 'faq', content: '본문', fallback: false }],
    );
    await flush();
    const result = await h.svc.approve(1, [{ title: '영상 요약', category: 'faq', content: '본문' }], 7);
    expect(result).toMatchObject({ saved: 1, attachedOriginals: 1 });
    expect(h.attachments.addLink).toHaveBeenCalledWith(
      1,
      1,
      'https://youtu.be/abc123',
      '설정 안내 영상',
      7,
    );
    expect(h.attachments.attachSharedCopy).not.toHaveBeenCalled();
  });

  it('an attachment failure never undoes the approval (warn-only)', async () => {
    const h = build('{"articles":[{"title":"T","category":"faq","content":"b"}]}');
    (h.fileRepo.findOne as jest.Mock).mockResolvedValue({
      filename: 'faq.csv',
      mime: 'text/csv',
      storagePath: 'kb-ingest/1/missing.csv',
    });
    await h.svc.startFile(1, file, 'counsel');
    await flush();
    // readFile on the missing path throws inside attachOriginal → caught.
    const result = await h.svc.approve(1, [{ title: 'T', category: 'faq', content: 'b' }], 7);
    expect(result).toMatchObject({ saved: 1, attachedOriginals: 0 });
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
