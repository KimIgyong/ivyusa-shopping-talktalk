import { Repository } from 'typeorm';
import { DiaryService } from './diary.service';
import { DiaryNote } from './entity/diary-note.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { SessionService } from '../session/session.service';
import { BusinessException } from '../../global/exception/business.exception';

/** DiaryService — shopping-diary memos (PLN-260807 F3, A-7). */
describe('DiaryService', () => {
  const session = { id: 11, tenantId: 7, customerId: 42, sessionToken: 'tok' };

  let notes: Array<Partial<DiaryNote>>;
  let catalog: Array<Partial<ProductCache>>;
  let deleteMock: jest.Mock;
  let findMock: jest.Mock;
  let svc: DiaryService;

  beforeEach(() => {
    notes = [];
    catalog = [{ id: 1, tenantId: 7, handle: 'vitamin-c-serum', title: 'Vitamin C Serum' }];
    deleteMock = jest.fn(async () => ({ affected: 0 }));
    findMock = jest.fn(async () => notes);

    const diaryRepo = {
      create: jest.fn((v: Partial<DiaryNote>) => v),
      save: jest.fn(async (v: Partial<DiaryNote>) => ({ id: 99, ...v })),
      find: findMock,
      delete: deleteMock,
    } as unknown as Repository<DiaryNote>;
    const productRepo = {
      findOne: jest.fn(
        async ({ where }: { where: { tenantId: number; handle: string } }) =>
          catalog.find((p) => p.tenantId === where.tenantId && p.handle === where.handle) ?? null,
      ),
    } as unknown as Repository<ProductCache>;
    const sessionService = {
      requireCustomer: jest.fn(async () => session),
      requireCustomerId: jest.fn(async () => session.customerId),
    } as unknown as SessionService;

    svc = new DiaryService(diaryRepo, productRepo, sessionService);
  });

  describe('create', () => {
    it('persists a memo with the session tenant/customer (no product pin)', async () => {
      const note = await svc.create('tok', 'first impression: love the texture');
      expect(note).toMatchObject({
        id: 99,
        tenantId: 7,
        customerId: 42,
        body: 'first impression: love the texture',
        productHandle: null,
      });
    });

    it('pins a memo to a catalog product when the handle exists in the tenant', async () => {
      const note = await svc.create('tok', 'restock this soon', 'vitamin-c-serum');
      expect(note.productHandle).toBe('vitamin-c-serum');
    });

    it('404s a pin whose handle is not in the tenant catalog', async () => {
      const err = await svc.create('tok', 'note', 'not-a-product').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(404);
    });

    it('rejects a body over 1000 chars with 400', async () => {
      const err = await svc.create('tok', 'x'.repeat(1001)).catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(400);
    });

    it('accepts a body of exactly 1000 chars and rejects an empty one', async () => {
      const ok = await svc.create('tok', 'x'.repeat(1000));
      expect(ok.body).toHaveLength(1000);
      const err = await svc.create('tok', '').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(400);
    });
  });

  describe('list', () => {
    it('returns the customer scope newest first, capped at 100 by default', async () => {
      await svc.list('tok');
      expect(findMock).toHaveBeenCalledWith({
        where: { customerId: 42 },
        order: { id: 'DESC' },
        take: 100,
      });
    });

    it('honors a smaller size and caps an oversized one at 100', async () => {
      await svc.list('tok', 5);
      expect(findMock).toHaveBeenLastCalledWith(expect.objectContaining({ take: 5 }));
      await svc.list('tok', 500);
      expect(findMock).toHaveBeenLastCalledWith(expect.objectContaining({ take: 100 }));
    });
  });

  describe('remove', () => {
    it('deletes by (id, customerId) — ownership lives in the WHERE', async () => {
      deleteMock.mockResolvedValueOnce({ affected: 1 });
      expect(await svc.remove('tok', 12)).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith({ id: 12, customerId: 42 });
    });

    it("is idempotent and blind to other customers' ids (affected 0 → removed false)", async () => {
      expect(await svc.remove('tok', 999)).toBe(false);
    });
  });
});
