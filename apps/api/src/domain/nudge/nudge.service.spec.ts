import { Repository } from 'typeorm';
import { NudgeService } from './nudge.service';
import { Nudge } from './entity/nudge.entity';
import { ProductCache } from '../product/entity/product-cache.entity';
import { Customer } from '../customer/entity/customer.entity';
import { SessionService } from '../session/session.service';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';

/** NudgeService — "please buy me this" share cards (PLN-260807 F2, A-5). */
describe('NudgeService', () => {
  const session = { id: 11, tenantId: 7, customerId: 42, sessionToken: 'tok' };

  let nudges: Array<Partial<Nudge>>;
  let catalog: Array<Partial<ProductCache>>;
  let customer: Partial<Customer> | null;
  let publish: jest.Mock;
  let increment: jest.Mock;
  let svc: NudgeService;

  beforeEach(() => {
    delete process.env.APP_PUBLIC_URL;
    nudges = [];
    catalog = [{ id: 1, tenantId: 7, handle: 'vitamin-c-serum', title: 'Vitamin C Serum' }];
    customer = { id: 42, name: 'Jane' };
    publish = jest.fn(async () => undefined);
    increment = jest.fn(async () => ({ affected: 1 }));

    const nudgeRepo = {
      create: jest.fn((v: Partial<Nudge>) => v),
      save: jest.fn(async (v: Partial<Nudge>) => ({ id: 5, views: 0, ...v })),
      findOne: jest.fn(async ({ where }: { where: { code: string } }) =>
        nudges.find((n) => n.code === where.code) ?? null,
      ),
      increment,
    } as unknown as Repository<Nudge>;
    const productRepo = {
      findOne: jest.fn(
        async ({ where }: { where: { tenantId: number; handle: string } }) =>
          catalog.find((p) => p.tenantId === where.tenantId && p.handle === where.handle) ?? null,
      ),
    } as unknown as Repository<ProductCache>;
    const customerRepo = {
      findOne: jest.fn(async () => customer),
    } as unknown as Repository<Customer>;
    const sessionService = {
      requireCustomer: jest.fn(async () => session),
    } as unknown as SessionService;
    const bus = { publish } as unknown as EventBusService;

    svc = new NudgeService(nudgeRepo, productRepo, customerRepo, sessionService, bus);
  });

  afterAll(() => {
    delete process.env.APP_PUBLIC_URL;
  });

  describe('create', () => {
    it('returns a 10-char code and the public card URL, and emits nudge_sent', async () => {
      const { code, url } = await svc.create('tok', 'vitamin-c-serum', 'buy me this? 🥺');
      expect(code).toHaveLength(10);
      expect(url).toBe(`https://shoptalk.amoeba.site/app/nudge/${code}`);
      expect(publish).toHaveBeenCalledWith('cjm.event', {
        tenantId: 7,
        customerId: 42,
        sessionId: 11,
        stage: 'Browse',
        eventType: 'nudge_sent',
        payload: { handle: 'vitamin-c-serum' },
      });
    });

    it('honors APP_PUBLIC_URL for the card URL', async () => {
      process.env.APP_PUBLIC_URL = 'http://localhost:5175';
      const { code, url } = await svc.create('tok', 'vitamin-c-serum');
      expect(url).toBe(`http://localhost:5175/app/nudge/${code}`);
    });

    it('rejects a handle outside the tenant catalog with 404', async () => {
      const err = await svc.create('tok', 'not-a-product').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(404);
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('viewByCode (public, no session)', () => {
    it('returns message + decrypted sender name + product card and counts the view atomically', async () => {
      nudges = [
        {
          id: 5,
          tenantId: 7,
          customerId: 42,
          productHandle: 'vitamin-c-serum',
          message: 'buy me this? 🥺',
          code: 'ABCDEFGHJK',
          views: 3,
        },
      ];
      const { nudge, senderName, product } = await svc.viewByCode('ABCDEFGHJK');
      expect(nudge.message).toBe('buy me this? 🥺');
      expect(senderName).toBe('Jane');
      expect(product?.handle).toBe('vitamin-c-serum');
      expect(increment).toHaveBeenCalledWith({ id: 5 }, 'views', 1);
    });

    it('tolerates an erased sender (senderName null) and a vanished product (null)', async () => {
      customer = null;
      catalog = [];
      nudges = [{ id: 5, tenantId: 7, customerId: 42, productHandle: 'gone', code: 'ABCDEFGHJK' }];
      const { senderName, product } = await svc.viewByCode('ABCDEFGHJK');
      expect(senderName).toBeNull();
      expect(product).toBeNull();
    });

    it('404s on an unknown code without counting a view', async () => {
      const err = await svc.viewByCode('NOPE').catch((e) => e);
      expect(err).toBeInstanceOf(BusinessException);
      expect(err.getStatus()).toBe(404);
      expect(increment).not.toHaveBeenCalled();
    });
  });
});
