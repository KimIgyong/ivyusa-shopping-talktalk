import { KbCategoryService } from './kb-category.service';
import { CATEGORY_ORIGIN, KbCategory } from './entity/kb-category.entity';
import { KbDocument } from './entity/kb-document.entity';

describe('KbCategoryService', () => {
  const row = (over: Partial<KbCategory> = {}): KbCategory =>
    ({
      id: 1,
      tenantId: 1,
      name: 'faq',
      label: null,
      origin: CATEGORY_ORIGIN.MANUAL,
      sortOrder: 10,
      hidden: 0,
      ...over,
    }) as KbCategory;

  const build = (rows: KbCategory[] = [], counts: Record<string, number> = {}) => {
    const saved: any[] = [];
    const updates: any[] = [];
    const deletes: any[] = [];
    const repo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) =>
        rows.find((r) =>
          where.id !== undefined ? String(r.id) === String(where.id) : r.name === where.name,
        ) ?? null,
      ),
      create: (d: any) => ({ ...d }),
      save: jest.fn(async (d: any) => {
        saved.push(d);
        return { id: 99, ...d };
      }),
      delete: jest.fn(async (w: any) => deletes.push(w)),
    };
    const docRepo = {
      count: jest.fn(async ({ where }: any) => counts[where.category] ?? 0),
      createQueryBuilder: () => ({
        select: function () { return this; },
        addSelect: function () { return this; },
        where: function () { return this; },
        andWhere: function () { return this; },
        groupBy: function () { return this; },
        getRawMany: async () =>
          Object.entries(counts).map(([category, count]) => ({ category, count: String(count) })),
      }),
    };
    const manager = {
      update: jest.fn(async (_e: unknown, where: any, set: any) => {
        updates.push({ where, set });
        return { affected: counts[where.category] ?? 0 };
      }),
      delete: jest.fn(async (_e: unknown, where: any) => deletes.push(where)),
    };
    const dataSource = { transaction: async (fn: any) => fn(manager) };
    return {
      svc: new KbCategoryService(repo as never, docRepo as never, dataSource as never),
      saved,
      updates,
      deletes,
    };
  };

  describe('list', () => {
    it('counts from the documents, not from the table', async () => {
      // A row whose documents were all moved must read 0, not its old total.
      const { svc } = build([row({ id: 1, name: 'faq' })], { faq: 3 });

      const out = await svc.list(1);

      expect(out[0]).toMatchObject({ name: 'faq', documentCount: 3 });
    });

    it('surfaces a category documents carry but no row describes', async () => {
      // Drift is the price of keeping the string on the document. Showing it
      // beats omitting those documents from the tenant's own category list.
      const { svc } = build([row({ id: 1, name: 'faq' })], { faq: 1, orphan: 4 });

      const out = await svc.list(1);

      expect(out.map((c) => c.name)).toEqual(['faq', 'orphan']);
      expect(out.find((c) => c.name === 'orphan')).toMatchObject({
        id: 'unregistered:orphan',
        documentCount: 4,
      });
    });
  });

  describe('rename', () => {
    it('moves the row and its documents together', async () => {
      const { svc, updates } = build([row({ id: 1, name: 'faq' })], { faq: 13 });

      await svc.rename(1, 1, 'Questions');

      expect(updates).toEqual([
        { where: { id: 1 }, set: { name: 'Questions' } },
        { where: { tenantId: 1, category: 'faq' }, set: { category: 'Questions' } },
      ]);
    });

    it('refuses a catalogue-derived category', async () => {
      // Product sync compares the stored category to decide a document is
      // unchanged, so this rename would be undone at the next run. An edit that
      // reverts itself is worse than one that was never offered.
      const { svc, updates } = build([row({ id: 1, name: 'Nike', origin: CATEGORY_ORIGIN.CATALOG })]);

      await expect(svc.rename(1, 1, 'Nike Inc')).rejects.toThrow();
      expect(updates).toHaveLength(0);
    });

    it('refuses to rename onto an existing name — that is a merge', async () => {
      const { svc, updates } = build([row({ id: 1, name: 'faq' }), row({ id: 2, name: 'policy' })]);

      await expect(svc.rename(1, 1, 'policy')).rejects.toThrow();
      expect(updates).toHaveLength(0);
    });
  });

  describe('merge', () => {
    it('moves documents into the target and drops the emptied rows', async () => {
      const rows = [
        row({ id: 1, name: 'policy' }),
        row({ id: 2, name: 'policy_return' }),
        row({ id: 3, name: 'policy_claims' }),
      ];
      const { svc, updates, deletes } = build(rows, { policy_return: 2, policy_claims: 0 });

      const res = await svc.merge(1, [2, 3], 1);

      expect(res.moved).toBe(2);
      expect(updates.map((u) => u.where.category)).toEqual(['policy_return', 'policy_claims']);
      expect(updates.every((u) => u.set.category === 'policy')).toBe(true);
      expect(deletes).toHaveLength(2);
    });

    it('ignores the target appearing in its own source list', async () => {
      const { svc, updates } = build([row({ id: 1, name: 'policy' })]);

      expect(await svc.merge(1, [1], 1)).toEqual({ moved: 0 });
      expect(updates).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('refuses while documents are still filed under it', async () => {
      // Deleting would strand them: the string stays on the document either way.
      const { svc, deletes } = build([row({ id: 1, name: 'faq' })], { faq: 13 });

      await expect(svc.remove(1, 1)).rejects.toThrow();
      expect(deletes).toHaveLength(0);
    });

    it('removes an empty one', async () => {
      const { svc, deletes } = build([row({ id: 1, name: 'faq' })], {});

      await svc.remove(1, 1);

      expect(deletes).toHaveLength(1);
    });
  });

  describe('ensure', () => {
    it('registers a category a writer just invented', async () => {
      const { svc, saved } = build([]);

      await svc.ensure(1, 'Nike', CATEGORY_ORIGIN.CATALOG);

      expect(saved[0]).toMatchObject({ name: 'Nike', origin: 'catalog' });
    });

    it('is a no-op when the row already exists', async () => {
      const { svc, saved } = build([row({ id: 1, name: 'Nike' })]);

      await svc.ensure(1, 'Nike', CATEGORY_ORIGIN.CATALOG);

      expect(saved).toHaveLength(0);
    });
  });
});
