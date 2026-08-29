import { BoardCommentService } from './board-comment.service';
import { BoardComment } from './entity/board-comment.entity';

describe('BoardCommentService', () => {
  function build(users: Array<{ id: number; name?: string; email?: string }> = []) {
    const rows: Partial<BoardComment>[] = [];
    let nextId = 1;
    const repo = {
      find: jest.fn(async ({ where }: any) =>
        rows.filter((r) => String(r.documentId) === String(where.documentId))),
      findOne: jest.fn(async ({ where }: any) =>
        rows.find((r) => String(r.id) === String(where.id)) ?? null),
      create: (d: Partial<BoardComment>) => d as BoardComment,
      save: jest.fn(async (d: BoardComment) => {
        const row = { id: nextId++, createdAt: new Date(), ...d };
        rows.push(row);
        return row;
      }),
      delete: jest.fn(async (w: any) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if (w.id !== undefined ? String(r.id) === String(w.id) : String(r.documentId) === String(w.documentId))
            rows.splice(i, 1);
        }
      }),
      createQueryBuilder: jest.fn(() => {
        const qb = {
          where: () => qb,
          andWhere: (_c: string, p: any) => {
            qb._uid = JSON.parse(p.uid);
            return qb;
          },
          orderBy: () => qb,
          take: () => qb,
          getMany: async () => rows.filter((r) => (r.mentions ?? []).includes(qb._uid)),
          _uid: 0,
        };
        return qb;
      }),
    };
    const userRepo = {
      find: jest.fn(async ({ where }: any) => {
        const wanted = (where.id?._value ?? where.id?.value ?? []) as number[];
        return users.filter((u) => wanted.map(Number).includes(u.id));
      }),
    };
    const svc = new BoardCommentService(repo as never, userRepo as never);
    return { svc, rows };
  }

  const actor = { userId: 7, rank: 'staff' };

  it('cleans mentions against tenant users and caps them', async () => {
    const h = build([
      { id: 8, name: '이서연' },
      { id: 9, email: 'p@x.com' },
    ]);
    const view = await h.svc.create(1, 5, '@이서연 확인 부탁', [8, 9, 999, 8], actor);
    expect(h.rows[0].mentions).toEqual([8, 9]); // 999(타 테넌트)는 조용히 제거, 중복 제거
    expect(view.mentions).toEqual([
      { id: '8', name: '이서연' },
      { id: '9', name: 'p@x.com' }, // 이름 없으면 이메일
    ]);
    expect(view.authorName).toBe('#7'); // 목록에 없는 작성자는 #id 폴백
  });

  it('rejects an empty body', async () => {
    const h = build();
    await expect(h.svc.create(1, 5, '   ', [], actor)).rejects.toThrow();
  });

  it('delete follows the author-or-lead rule', async () => {
    const h = build();
    await h.svc.create(1, 5, '메모', [], actor);
    await expect(h.svc.remove(1, 1, { userId: 99, rank: 'staff' })).rejects.toThrow();
    await h.svc.remove(1, 1, { userId: 99, rank: 'director' });
    expect(h.rows).toHaveLength(0);
  });

  it('mentionsFor returns only comments tagging the caller', async () => {
    const h = build([{ id: 8, name: 'a' }, { id: 9, name: 'b' }]);
    await h.svc.create(1, 5, '첫번째 @8', [8], actor);
    await h.svc.create(1, 5, '두번째 @9', [9], actor);
    const mine = await h.svc.mentionsFor(1, 8);
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toContain('첫번째');
  });

  it("removeAllFor wipes a document's comments", async () => {
    const h = build();
    await h.svc.create(1, 5, 'a', [], actor);
    await h.svc.create(1, 5, 'b', [], actor);
    await h.svc.removeAllFor(1, 5);
    expect(h.rows).toHaveLength(0);
  });
});
