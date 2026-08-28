import { KbCategoryService } from './kb-category.service';
import { CATEGORY_ORIGIN, KbCategory } from './entity/kb-category.entity';

/**
 * Group-axis semantics (PLN-260829 D2). The same name in another group is a
 * DIFFERENT category: lookups, renames and merges must all say which group
 * they mean, or documents leak between groups.
 */
describe('KbCategoryService group axis', () => {
  const row = (over: Partial<KbCategory> = {}): KbCategory =>
    ({
      id: 1,
      tenantId: 1,
      docGroup: 'counsel',
      name: 'faq',
      label: null,
      origin: CATEGORY_ORIGIN.MANUAL,
      sortOrder: 10,
      hidden: 0,
      agentIds: null,
      ...over,
    }) as KbCategory;

  const build = (rows: KbCategory[] = []) => {
    const saved: Array<Record<string, unknown>> = [];
    const updates: Array<{ where: Record<string, unknown>; set: Record<string, unknown> }> = [];
    const repo = {
      find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => !where.docGroup || r.docGroup === where.docGroup),
      ),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) =>
          where.id !== undefined
            ? String(r.id) === String(where.id)
            : r.name === where.name && (where.docGroup === undefined || r.docGroup === where.docGroup),
        ) ?? null,
      ),
      create: (d: Record<string, unknown>) => ({ ...d }),
      save: jest.fn(async (d: Record<string, unknown>) => {
        saved.push(d);
        return { id: 99, ...d };
      }),
      delete: jest.fn(async () => undefined),
    };
    const docRepo = {
      count: jest.fn(async () => 0),
      createQueryBuilder: () => {
        const qb = {
          select: () => qb,
          addSelect: () => qb,
          where: () => qb,
          andWhere: () => qb,
          groupBy: () => qb,
          getRawMany: async () => [],
        };
        return qb;
      },
    };
    const manager = {
      update: jest.fn(async (_e: unknown, where: Record<string, unknown>, set: Record<string, unknown>) => {
        updates.push({ where, set });
        return { affected: 1 };
      }),
      delete: jest.fn(async () => undefined),
    };
    const dataSource = { transaction: async (fn: (m: unknown) => Promise<void>) => fn(manager) };
    const svc = new KbCategoryService(
      repo as never,
      docRepo as never,
      { find: jest.fn(async () => []) } as never,
      dataSource as never,
    );
    return { svc, repo, saved, updates };
  };

  it('ensure() creates the same name independently per group', async () => {
    const h = build([row({ docGroup: 'counsel', name: '배송' })]);
    await h.svc.ensure(1, '배송', CATEGORY_ORIGIN.MANUAL, 'operation');
    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]).toMatchObject({ docGroup: 'operation', name: '배송' });
  });

  it('ensure() is a no-op when the (group, name) row already exists', async () => {
    const h = build([row({ docGroup: 'operation', name: '배송' })]);
    await h.svc.ensure(1, '배송', CATEGORY_ORIGIN.MANUAL, 'operation');
    expect(h.saved).toHaveLength(0);
  });

  it('create() only collides inside its own group', async () => {
    const h = build([row({ docGroup: 'counsel', name: 'faq' })]);
    const made = await h.svc.create(1, 'faq', null, 'operation');
    expect(made).toMatchObject({ docGroup: 'operation', name: 'faq' });
    await expect(h.svc.create(1, 'faq', null, 'counsel')).rejects.toThrow();
  });

  it("rename() moves only the row's own group's documents", async () => {
    const h = build([row({ id: 5, docGroup: 'operation', name: '리포트' })]);
    await h.svc.rename(1, 5, '보고서');
    const docUpdate = h.updates.find((u) => u.set.category === '보고서');
    expect(docUpdate!.where).toMatchObject({ tenantId: 1, docGroup: 'operation', category: '리포트' });
  });

  it('merge() refuses to cross groups', async () => {
    const h = build([
      row({ id: 5, docGroup: 'counsel', name: 'faq' }),
      row({ id: 6, docGroup: 'operation', name: '용어' }),
    ]);
    await expect(h.svc.merge(1, [6], 5)).rejects.toThrow();
  });

  it('list() returns only the requested group', async () => {
    const h = build([
      row({ id: 5, docGroup: 'counsel', name: 'faq' }),
      row({ id: 6, docGroup: 'operation', name: '용어' }),
    ]);
    const out = await h.svc.list(1, 'operation');
    expect(out.map((c) => c.name)).toEqual(['용어']);
  });
});
