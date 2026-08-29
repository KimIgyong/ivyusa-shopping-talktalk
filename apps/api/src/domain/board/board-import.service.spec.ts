import { BoardImportService } from './board-import.service';

/** FAQ/Q&A export → board import (PLN-260829 B4 P6-1~P6-4). */
describe('BoardImportService', () => {
  function build(existingTitles: string[] = []) {
    const created: Array<Record<string, unknown>> = [];
    const audited: Array<Record<string, unknown>> = [];
    const docRepo = {
      find: jest.fn(async () => existingTitles.map((t, i) => ({ id: i + 1, title: t }))),
    };
    const board = {
      create: jest.fn(async (_t: number, body: Record<string, unknown>) => {
        const row = { id: created.length + 1, ...body };
        created.push(row);
        return row;
      }),
    };
    const audit = { write: jest.fn(async (p: Record<string, unknown>) => audited.push(p)) };
    const svc = new BoardImportService(docRepo as never, board as never, audit as never);
    return { svc, created, audited, board };
  }

  const actor = { userId: 7, rank: 'manager' };
  const csv = (text: string) => ({ originalname: 'faq.csv', buffer: Buffer.from(text, 'utf8') });

  it('creates published board documents with the faq-import tag and category default', async () => {
    const h = build();
    const result = await h.svc.importFaq(
      1,
      'counsel',
      csv('title,content,category2,tags\n환불되나요?,7일 이내 가능합니다,,정책;환불\n배송 기간은?,2~3일입니다,,'),
      actor,
    );
    expect(result).toMatchObject({ parsed: 2, created: 2, skipped: 0, invalid: 0 });
    expect(h.created[0]).toMatchObject({
      doc_group: 'counsel',
      category1: 'FAQ',
      title: '환불되나요?',
      status: 'published',
      tags: ['정책', '환불', 'faq-import'],
    });
    expect(h.audited[0]).toMatchObject({ action: 'board.faq_imported', actorId: 7 });
  });

  it('skips duplicate titles — both pre-existing and repeated within the file', async () => {
    const h = build(['환불되나요?']);
    const result = await h.svc.importFaq(
      1,
      'counsel',
      csv('title,content\n환불되나요?,이미 있음\n새 질문,답변\n새 질문,같은 파일 반복'),
      actor,
    );
    expect(result).toMatchObject({ parsed: 3, created: 1, skipped: 2 });
    expect(h.created).toHaveLength(1);
  });

  it('reports row-level errors for empty title/content without aborting the rest', async () => {
    const h = build();
    const result = await h.svc.importFaq(
      1,
      'operation',
      csv('title,content\n,본문만 있음\n제목만 있음,\n정상,본문'),
      actor,
    );
    expect(result).toMatchObject({ parsed: 3, created: 1, invalid: 2 });
    expect(result.errors).toEqual([
      { row: 2, reason: 'title is empty' },
      { row: 3, reason: 'content is empty' },
    ]);
  });

  it('rejects a file missing the required columns with the bulk-import code', async () => {
    const h = build();
    await expect(
      h.svc.importFaq(1, 'counsel', csv('question,answer\nq,a'), actor),
    ).rejects.toMatchObject({ errorCode: 'E5063' });
    expect(h.created).toHaveLength(0);
  });

  it('rejects unsupported files and non-UTF-8 CSV', async () => {
    const h = build();
    await expect(
      h.svc.importFaq(1, 'counsel', { originalname: 'faq.hwp', buffer: Buffer.from('x') }, actor),
    ).rejects.toMatchObject({ errorCode: 'E5061' });
    const cp949 = Buffer.from([0x74, 0x69, 0x74, 0x6c, 0x65, 0x2c, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x0a, 0xc8, 0xaf, 0xba, 0xd2, 0x2c, 0xb3, 0xbb, 0xbf, 0xeb]);
    await expect(
      h.svc.importFaq(1, 'counsel', { originalname: 'faq.csv', buffer: cp949 }, actor),
    ).rejects.toMatchObject({ errorCode: 'E5062' });
  });
});
