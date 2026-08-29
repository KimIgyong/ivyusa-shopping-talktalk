import { BoardService } from './board.service';
import { Board } from './entity/board.entity';
import { BOARD_DOC_STATUS, BoardDocument } from './entity/board-document.entity';
import { BoardDocumentRevision } from './entity/board-document-revision.entity';

describe('BoardService', () => {
  function build(opts: { boards?: Partial<Board>[]; docs?: Partial<BoardDocument>[] } = {}) {
    const boards: Partial<Board>[] = [...(opts.boards ?? [])];
    const docs: Partial<BoardDocument>[] = [...(opts.docs ?? [])];
    const revs: Partial<BoardDocumentRevision>[] = [];
    let nextId = 100;

    const boardRepo = {
      findOne: jest.fn(async ({ where }: any) => boards.find((b) => b.tenantId === where.tenantId) ?? null),
      create: (d: any) => d,
      save: jest.fn(async (d: any) => {
        const row = { id: nextId++, ...d };
        boards.push(row);
        return row;
      }),
    };
    const docRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        docs.find((d) => String(d.id) === String(where.id) && d.tenantId === where.tenantId) ?? null),
      create: (d: any) => d,
      save: jest.fn(async (d: any) => {
        if (d.id == null) {
          const row = { id: nextId++, ...d };
          docs.push(row);
          return row;
        }
        return d;
      }),
      delete: jest.fn(async ({ id }: any) => {
        const i = docs.findIndex((d) => String(d.id) === String(id));
        if (i >= 0) docs.splice(i, 1);
      }),
      createQueryBuilder: jest.fn(),
    };
    const revRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        const mine = revs
          .filter((r) => String(r.documentId) === String(where.documentId))
          .sort((a, b) => (b.revisionNo ?? 0) - (a.revisionNo ?? 0));
        if (where.id !== undefined) return revs.find((r) => String(r.id) === String(where.id)) ?? null;
        return mine[0] ?? null;
      }),
      find: jest.fn(async () => revs),
      create: (d: any) => d,
      save: jest.fn(async (d: any) => {
        const row = { id: nextId++, ...d };
        revs.push(row);
        return row;
      }),
    };
    const svc = new BoardService(boardRepo as never, docRepo as never, revRepo as never);
    return { svc, boards, docs, revs, boardRepo };
  }

  const actor = { userId: 7, rank: 'staff' };
  const input = { category1: '환불', title: '7일 정책', content: '주문 후 7일 [[환불 예외]] 참고' };

  it('ensureDefault creates exactly one board per tenant and is idempotent', async () => {
    const h = build();
    const a = await h.svc.ensureDefault(1);
    const b = await h.svc.ensureDefault(1);
    expect(String(a.id)).toBe(String(b.id));
    expect(h.boards).toHaveLength(1);
    expect(h.boards[0]).toMatchObject({ tenantId: 1, name: 'Smart Knowledge Board' });
  });

  it('ensureDefault survives losing the unique-key race', async () => {
    const h = build();
    const winner = { id: 55, tenantId: 1, name: 'Smart Knowledge Board' };
    (h.boardRepo.findOne as jest.Mock)
      .mockResolvedValueOnce(null) // the pre-check misses
      .mockResolvedValueOnce(winner); // the post-failure re-read finds the winner
    (h.boardRepo.save as jest.Mock).mockRejectedValueOnce(new Error('ER_DUP_ENTRY'));
    const board = await h.svc.ensureDefault(1);
    expect(String(board.id)).toBe('55');
  });

  it('create records revision 1, parses wikilinks, defaults to draft', async () => {
    const h = build();
    const doc = await h.svc.create(1, input, actor);
    expect(doc).toMatchObject({
      docGroup: 'counsel',
      category1: '환불',
      status: BOARD_DOC_STATUS.DRAFT,
      authorUserId: 7,
      links: ['환불 예외'],
    });
    expect(h.revs).toHaveLength(1);
    expect(h.revs[0]).toMatchObject({ revisionNo: 1, changeKind: 'create' });
  });

  it('update snapshots max+1 revision and re-parses links on content change', async () => {
    const h = build();
    const doc = await h.svc.create(1, input, actor);
    const updated = await h.svc.update(1, Number(doc.id), { content: '이제 [[반품 절차]]만' }, actor);
    expect(updated.links).toEqual(['반품 절차']);
    expect(h.revs.map((r) => r.revisionNo)).toEqual([1, 2]);
    expect(h.revs[1]!.changedFields).toEqual(['content']);
  });

  it('update refuses the B2-only statuses', async () => {
    const h = build();
    const doc = await h.svc.create(1, input, actor);
    await expect(h.svc.update(1, Number(doc.id), { status: 'promoted' }, actor)).rejects.toThrow();
  });

  it("delete refuses a non-author staff but allows the author and a director", async () => {
    const h = build();
    const doc = await h.svc.create(1, input, actor);
    await expect(h.svc.remove(1, Number(doc.id), { userId: 99, rank: 'staff' })).rejects.toThrow();
    await h.svc.remove(1, Number(doc.id), { userId: 99, rank: 'director' });
    expect(h.docs).toHaveLength(0);
    // A delete snapshot survives the row.
    expect(h.revs.some((r) => r.changeKind === 'delete')).toBe(true);
  });

  it('no-op update writes no revision', async () => {
    const h = build();
    const doc = await h.svc.create(1, input, actor);
    await h.svc.update(1, Number(doc.id), { title: '7일 정책' }, actor);
    expect(h.revs).toHaveLength(1);
  });
});
