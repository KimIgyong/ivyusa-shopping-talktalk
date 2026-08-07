import { In, Repository } from 'typeorm';
import { SaveService } from './save.service';
import { ProductSave } from './entity/product-save.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { SessionService } from '../session/session.service';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';

/** SaveService — wishlist/save-for-later (PLN-260807 F2, A-4). */
describe('SaveService', () => {
  const session = { id: 11, tenantId: 7, customerId: 42, sessionToken: 'tok' };

  let saves: Array<Partial<ProductSave>>;
  let catalog: Array<Partial<ProductCache>>;
  let publish: jest.Mock;
  let deleteMock: jest.Mock;
  let svc: SaveService;

  beforeEach(() => {
    saves = [];
    catalog = [{ id: 1, tenantId: 7, handle: 'vitamin-c-serum', title: 'Vitamin C Serum' }];
    publish = jest.fn(async () => undefined);
    deleteMock = jest.fn(async () => ({ affected: 0 }));

    const saveRepo = {
      create: jest.fn((v: Partial<ProductSave>) => v),
      save: jest.fn(async (v: Partial<ProductSave>) => ({ id: 99, ...v })),
      find: jest.fn(async () => saves),
      findOne: jest.fn(
        async ({ where }: { where: { customerId: number; productHandle: string; list: string } }) =>
          saves.find(
            (s) =>
              s.customerId === where.customerId &&
              s.productHandle === where.productHandle &&
              s.list === where.list,
          ) ?? null,
      ),
      delete: deleteMock,
    } as unknown as Repository<ProductSave>;
    const productRepo = {
      find: jest.fn(async () => catalog),
      findOne: jest.fn(
        async ({ where }: { where: { tenantId: number; handle: string } }) =>
          catalog.find((p) => p.tenantId === where.tenantId && p.handle === where.handle) ?? null,
      ),
    } as unknown as Repository<ProductCache>;
    const sessionService = {
      requireCustomer: jest.fn(async () => session),
      requireCustomerId: jest.fn(async () => session.customerId),
    } as unknown as SessionService;
    const bus = { publish } as unknown as EventBusService;

    svc = new SaveService(saveRepo, productRepo, sessionService, bus);
  });

  describe('upsert', () => {
    it('creates a new save with the session tenant and emits wish_added for the wish list', async () => {
      const { save, product } = await svc.upsert('tok', 'vitamin-c-serum', 'wish');
      expect(save).toMatchObject({
        tenantId: 7,
        customerId: 42,
        productHandle: 'vitamin-c-serum',
        list: 'wish',
        note: null,
      });
      expect(product?.handle).toBe('vitamin-c-serum');
      expect(publish).toHaveBeenCalledWith('cjm.event', {
        tenantId: 7,
        customerId: 42,
        sessionId: 11,
        stage: 'Browse',
        eventType: 'wish_added',
        payload: { handle: 'vitamin-c-serum' },
      });
    });

    it("emits save_added for the 'later' list", async () => {
      await svc.upsert('tok', 'vitamin-c-serum', 'later');
      expect(publish).toHaveBeenCalledWith(
        'cjm.event',
        expect.objectContaining({ eventType: 'save_added' }),
      );
    });

    it('re-save updates the note in place and does NOT emit a journey event', async () => {
      saves = [
        { id: 5, customerId: 42, productHandle: 'vitamin-c-serum', list: 'wish', note: 'old' },
      ];
      const { save } = await svc.upsert('tok', 'vitamin-c-serum', 'wish', 'birthday gift idea');
      expect(save.note).toBe('birthday gift idea');
      expect(publish).not.toHaveBeenCalled();
    });

    it('rejects a handle outside the tenant catalog with 404', async () => {
      const err = await svc.upsert('tok', 'not-a-product', 'wish').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(404);
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('joins catalog cards by handle and keeps rows whose handle left the catalog (product: null)', async () => {
      saves = [
        { id: 2, customerId: 42, productHandle: 'gone-product', list: 'wish' },
        { id: 1, customerId: 42, productHandle: 'vitamin-c-serum', list: 'wish' },
      ];
      const rows = await svc.list('tok');
      expect(rows).toHaveLength(2);
      expect(rows[0].product).toBeNull();
      expect(rows[1].product?.handle).toBe('vitamin-c-serum');
    });

    it('passes the list filter through to the query', async () => {
      const saveRepoFind = (
        svc as unknown as { saveRepo: { find: jest.Mock } }
      ).saveRepo.find;
      await svc.list('tok', 'later');
      expect(saveRepoFind).toHaveBeenCalledWith({
        where: { customerId: 42, list: 'later' },
        order: { id: 'DESC' },
      });
    });

    it('queries products with the tenant scope and the deduped handle set', async () => {
      saves = [
        { id: 1, customerId: 42, productHandle: 'vitamin-c-serum', list: 'wish' },
        { id: 2, customerId: 42, productHandle: 'vitamin-c-serum', list: 'later' },
      ];
      const productFind = (
        svc as unknown as { productRepo: { find: jest.Mock } }
      ).productRepo.find;
      await svc.list('tok');
      expect(productFind).toHaveBeenCalledWith({
        where: { tenantId: 7, handle: In(['vitamin-c-serum']) },
      });
    });
  });

  describe('remove', () => {
    it('deletes by (customer, handle, list) and reports whether a row existed', async () => {
      deleteMock.mockResolvedValueOnce({ affected: 1 });
      expect(await svc.remove('tok', 'vitamin-c-serum', 'wish')).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith({
        customerId: 42,
        productHandle: 'vitamin-c-serum',
        list: 'wish',
      });
    });

    it('is idempotent — removing a non-existent save is not an error', async () => {
      expect(await svc.remove('tok', 'vitamin-c-serum', 'wish')).toBe(false);
    });
  });
});
