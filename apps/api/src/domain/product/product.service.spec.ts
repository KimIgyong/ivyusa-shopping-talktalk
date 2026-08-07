import { Like } from 'typeorm';
import { ProductService } from './product.service';
import { ProductCache } from './entity/product-cache.entity';
import { BusinessException } from '../../global/exception/business.exception';

/** ProductService — tenant-scoped catalog reads (PLN-260807 F1). */
describe('ProductService', () => {
  function build(rows: Partial<ProductCache>[] = [], saves: Array<{ productHandle: string }> = []) {
    const repo = {
      findAndCount: jest.fn().mockResolvedValue([rows as ProductCache[], rows.length]),
      find: jest.fn(async (opts?: { where?: { handle?: unknown; status?: string }; take?: number }) => {
        // Recommendation queries hit find() twice (saved join, candidates); the
        // legacy suites only assert call args, so returning the full fixture with
        // basic filters applied keeps every caller honest enough.
        let out = rows as ProductCache[];
        const status = opts?.where?.status;
        if (status) out = out.filter((r) => r.status === undefined || r.status === status);
        const handleIn = opts?.where?.handle as { value?: string[] } | undefined;
        if (handleIn?.value) out = out.filter((r) => handleIn.value?.includes(r.handle));
        if (opts?.take) out = out.slice(0, opts.take);
        return out;
      }),
      findOne: jest.fn(async ({ where }: { where: { handle: string } }) =>
        (rows as ProductCache[]).find((r) => r.handle === where.handle) ?? null,
      ),
    };
    const saveRepo = {
      find: jest.fn().mockResolvedValue(saves),
    };
    return { svc: new ProductService(repo as never, saveRepo as never), repo, saveRepo };
  }

  describe('list', () => {
    it('filters by tenant + active status, newest first, paginated', async () => {
      const { svc, repo } = build([{ handle: 'a' }]);
      await svc.list(7, undefined, undefined, 2, 20);
      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { tenantId: 7, status: 'active' },
        order: { publishedAt: 'DESC', id: 'DESC' },
        skip: 20,
        take: 20,
      });
    });

    it('searches title OR tags with a contains-LIKE', async () => {
      const { svc, repo } = build();
      await svc.list(7, 'serum', undefined, 1, 20);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { tenantId: 7, status: 'active', title: Like('%serum%') },
            { tenantId: 7, status: 'active', tags: Like('%serum%') },
          ],
        }),
      );
    });

    it('applies an exact category filter alongside the search', async () => {
      const { svc, repo } = build();
      await svc.list(7, 'mask', 'Skin Care', 1, 20);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { tenantId: 7, status: 'active', category: 'Skin Care', title: Like('%mask%') },
            { tenantId: 7, status: 'active', category: 'Skin Care', tags: Like('%mask%') },
          ],
        }),
      );
    });

    it('a session without a tenant sees an empty catalog — no query issued', async () => {
      const { svc, repo } = build([{ handle: 'other-tenant-product' }]);
      expect(await svc.list(null, undefined, undefined, 1, 20)).toEqual([[], 0]);
      expect(repo.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('categories', () => {
    it('returns distinct non-empty categories of active rows, sorted', async () => {
      const { svc, repo } = build([
        { category: 'Serum' },
        { category: 'Mask' },
        { category: 'Serum' },
        { category: null },
        { category: '  ' },
      ]);
      expect(await svc.categories(7)).toEqual(['Mask', 'Serum']);
      expect(repo.find).toHaveBeenCalledWith({
        where: { tenantId: 7, status: 'active' },
        select: ['category'],
      });
    });

    it('is empty without a tenant', async () => {
      const { svc, repo } = build([{ category: 'Serum' }]);
      expect(await svc.categories(null)).toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    it('returns the row for the tenant + handle', async () => {
      const { svc } = build([{ handle: 'vita-c-serum', title: 'Vita C Serum' }]);
      const found = await svc.detail(7, 'vita-c-serum');
      expect(found.title).toBe('Vita C Serum');
    });

    it('404s on an unknown handle', async () => {
      const { svc } = build();
      await expect(svc.detail(7, 'nope')).rejects.toThrow(BusinessException);
    });

    it('404s without a tenant rather than searching cross-tenant', async () => {
      const { svc, repo } = build([{ handle: 'vita-c-serum' }]);
      await expect(svc.detail(null, 'vita-c-serum')).rejects.toThrow(BusinessException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('recommendations (A-10 v1 rules)', () => {
    // Fixture is pre-ordered newest-first — the stub repo does not sort, mirroring
    // the ORDER BY the service requests. All rows active.
    const catalog: Partial<ProductCache>[] = [
      { handle: 'new-toner', title: 'Toner', status: 'active', category: 'Toner', tags: 'hydration' },
      { handle: 'serum-b', title: 'Serum B', status: 'active', category: 'Serum', tags: 'brightening' },
      { handle: 'mask-vita', title: 'Mask', status: 'active', category: 'Mask', tags: 'vitamin-c, sheet' },
      { handle: 'serum-a', title: 'Serum A', status: 'active', category: 'Serum', tags: 'vitamin-c' },
    ];

    it('anonymous → newest actives capped at size', async () => {
      const { svc, repo } = build(catalog);
      const out = await svc.recommendations(7, null, 2);
      expect(out.map((p) => p.handle)).toEqual(['new-toner', 'serum-b']);
      expect(repo.find).toHaveBeenCalledWith({
        where: { tenantId: 7, status: 'active' },
        order: { publishedAt: 'DESC', id: 'DESC' },
        take: 2,
      });
    });

    it('zero-signal (customer with no saves) → newest actives', async () => {
      const { svc } = build(catalog, []);
      const out = await svc.recommendations(7, 42, 3);
      expect(out.map((p) => p.handle)).toEqual(['new-toner', 'serum-b', 'mask-vita']);
    });

    it('ranks category match (2) above tag-only match (1) above the newest fill', async () => {
      // Saved: serum-a (category Serum, tag vitamin-c).
      const { svc } = build(catalog, [{ productHandle: 'serum-a' }]);
      const out = await svc.recommendations(7, 42, 4);
      // serum-b: category Serum → 2; mask-vita: tag vitamin-c → 1; new-toner: 0 (fill).
      expect(out.map((p) => p.handle)).toEqual(['serum-b', 'mask-vita', 'new-toner']);
    });

    it('excludes handles the customer already saved', async () => {
      const { svc } = build(catalog, [{ productHandle: 'serum-a' }]);
      const out = await svc.recommendations(7, 42, 10);
      expect(out.map((p) => p.handle)).not.toContain('serum-a');
    });

    it('is empty without a tenant — no query issued', async () => {
      const { svc, repo, saveRepo } = build(catalog, [{ productHandle: 'serum-a' }]);
      expect(await svc.recommendations(null, 42, 10)).toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
      expect(saveRepo.find).not.toHaveBeenCalled();
    });
  });
});
