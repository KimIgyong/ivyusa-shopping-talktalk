import { Repository } from 'typeorm';
import { ReviewService } from './review.service';
import { Review } from './entity/review.entity';
import { Session } from '../session/entity/session.entity';
import { OrderItem } from '../order/entity/order-item.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { SessionService } from '../session/session.service';
import { ModerationService } from '../moderation/moderation.service';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';

/** ReviewService — D1 ownership, D2 moderation, D3 hide/unhide (PLN-260807 F2, A-8). */
describe('ReviewService', () => {
  const session = { id: 11, tenantId: 7, customerId: 42, sessionToken: 'tok' };

  let reviewRows: Array<Partial<Review>>;
  let items: Array<Partial<OrderItem>>;
  let orders: Array<Partial<OrderCache>>;
  let moderate: jest.Mock;
  let publish: jest.Mock;
  let saved: Partial<Review> | null;
  let svc: ReviewService;

  beforeEach(() => {
    reviewRows = [];
    items = [{ id: 100, orderId: 900 }];
    orders = [{ id: 900, customerId: 42, tenantId: 7 }];
    moderate = jest.fn(async ({ text }: { text: string }) => ({
      decision: 'delivered',
      action: 'none',
      text,
    }));
    publish = jest.fn(async () => undefined);
    saved = null;

    const reviewRepo = {
      create: jest.fn((v: Partial<Review>) => v),
      save: jest.fn(async (v: Partial<Review>) => {
        saved = v;
        return { id: 1, ...v };
      }),
      find: jest.fn(async () => reviewRows),
      findAndCount: jest.fn(async () => [reviewRows, reviewRows.length]),
      findOne: jest.fn(async ({ where }: { where: { id: number; tenantId?: number } }) =>
        reviewRows.find(
          (r) => Number(r.id) === Number(where.id) && (where.tenantId === undefined || r.tenantId === where.tenantId),
        ) ?? null,
      ),
    } as unknown as Repository<Review>;
    const sessionRepo = { findOne: jest.fn(async () => session) } as unknown as Repository<Session>;
    const orderItemRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
        items.find((i) => Number(i.id) === Number(where.id)) ?? null,
      ),
    } as unknown as Repository<OrderItem>;
    const orderRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
        orders.find((o) => Number(o.id) === Number(where.id)) ?? null,
      ),
    } as unknown as Repository<OrderCache>;
    const sessionService = {
      requireCustomer: jest.fn(async () => session),
      requireCustomerId: jest.fn(async () => session.customerId),
    } as unknown as SessionService;
    const moderation = { moderate } as unknown as ModerationService;
    const bus = { publish } as unknown as EventBusService;

    svc = new ReviewService(
      reviewRepo,
      sessionRepo,
      orderItemRepo,
      orderRepo,
      sessionService,
      moderation,
      bus,
    );
  });

  describe('create — D1 ownership', () => {
    it('accepts the owner, stamps tenantId from the session, and emits the CJM event', async () => {
      const review = await svc.create('tok', 100, 5, 'great serum');
      expect(review.id).toBe(1);
      expect(saved).toMatchObject({
        tenantId: 7,
        orderItemId: 100,
        customerId: 42,
        rating: 5,
        status: 'submitted',
      });
      expect(publish).toHaveBeenCalledWith(
        'cjm.event',
        expect.objectContaining({ tenantId: 7, customerId: 42, eventType: 'review_submitted' }),
      );
    });

    it('rejects an unknown order item with 404', async () => {
      await expect(svc.create('tok', 999, 5)).rejects.toMatchObject({ errorCode: 'E5002' });
    });

    it("rejects another customer's order item with 403 and does not persist", async () => {
      orders = [{ id: 900, customerId: 77, tenantId: 7 }];
      const err = await svc.create('tok', 100, 5).catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(403);
      expect(saved).toBeNull();
    });

    it('rejects an order with no customer binding with 403', async () => {
      orders = [{ id: 900, customerId: null, tenantId: 7 }];
      const err = await svc.create('tok', 100, 5).catch((e) => e);
      expect(err.getStatus()).toBe(403);
    });
  });

  describe('create — D2 moderation gate', () => {
    it('persists the moderated (possibly masked) text, not the raw body', async () => {
      moderate.mockResolvedValueOnce({ decision: 'edited', action: 'mask', text: 'g*** serum' });
      await svc.create('tok', 100, 4, 'gross serum');
      expect(moderate).toHaveBeenCalledWith({
        tenantId: 7,
        scope: 'agent',
        authorType: 'agent',
        text: 'gross serum',
      });
      expect(saved).toMatchObject({ body: 'g*** serum' });
    });

    it('a BLOCKED verdict aborts with 422 and persists nothing', async () => {
      moderate.mockResolvedValueOnce({ decision: 'blocked', action: 'block', text: '' });
      const err = await svc.create('tok', 100, 1, 'spam link').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(422);
      expect(err.errorCode).toBe('E4002');
      expect(saved).toBeNull();
    });

    it('an empty/absent body skips the moderation call', async () => {
      await svc.create('tok', 100, 5);
      await svc.create('tok', 100, 5, '   ');
      expect(moderate).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus — D3 hide/unhide', () => {
    it('hides a review within the tenant', async () => {
      reviewRows = [{ id: 5, tenantId: 7, status: 'submitted' }];
      const updated = await svc.updateStatus(7, 5, 'hidden');
      expect(updated.status).toBe('hidden');
      expect(saved).toMatchObject({ id: 5, status: 'hidden' });
    });

    it("404s on another tenant's review — no cross-tenant hide", async () => {
      reviewRows = [{ id: 5, tenantId: 8, status: 'submitted' }];
      const err = await svc.updateStatus(7, 5, 'hidden').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(404);
    });
  });

  describe('listForSession', () => {
    it('returns own reviews regardless of status (hidden included)', async () => {
      reviewRows = [
        { id: 2, customerId: 42, status: 'hidden' },
        { id: 1, customerId: 42, status: 'submitted' },
      ];
      const list = await svc.listForSession('tok');
      expect(list).toHaveLength(2);
      expect(list.map((r) => r.status)).toEqual(['hidden', 'submitted']);
    });
  });

  describe('requestReview — names the item it is about (PLN-260817 S5)', () => {
    it('emits refType/refId so the widget can open the form for that item', async () => {
      await svc.requestReview(4242, 42, 7);
      expect(publish).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          category: 'review',
          refType: 'order_item',
          refId: 4242,
        }),
      );
    });

    it('does not smuggle the id under a field NotifyInput ignores', async () => {
      // The original bug: `orderItemId` was published, NotifyInput had no such
      // field, and the id vanished between the emitter and the row.
      await svc.requestReview(4242, 42, 7);
      const payload = publish.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('orderItemId');
    });
  });
});
