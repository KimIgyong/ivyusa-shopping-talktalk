import { Like } from 'typeorm';
import { ProductService } from './product.service';
import { ProductCache } from './entity/product-cache.entity';
import { BusinessException } from '../../global/exception/business.exception';

/** ProductService — tenant-scoped catalog reads (PLN-260807 F1). */
describe('ProductService', () => {
  function build(rows: Partial<ProductCache>[] = []) {
    const repo = {
      findAndCount: jest.fn().mockResolvedValue([rows as ProductCache[], rows.length]),
      find: jest.fn().mockResolvedValue(rows as ProductCache[]),
      findOne: jest.fn(async ({ where }: { where: { handle: string } }) =>
        (rows as ProductCache[]).find((r) => r.handle === where.handle) ?? null,
      ),
    };
    return { svc: new ProductService(repo as never), repo };
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
});
