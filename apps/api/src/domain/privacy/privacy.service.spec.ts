import { Repository } from 'typeorm';
import { PrivacyService } from './privacy.service';
import { Session } from '../session/entity/session.entity';
import { NotificationPref } from '../notification/entity/notification-pref.entity';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../../infrastructure/cache/redis.service';

const EXTERNAL = ['email', 'sms', 'web_push', 'push'];
const CATEGORIES = ['payment', 'shipping', 'event', 'review', 'chat'];

describe('PrivacyService.setOptOut / getOptOutStatus (Stage 6 — bulk upsert)', () => {
  let svc: PrivacyService;
  let session: Partial<Session> | null;
  let prefFindResult: Array<Partial<NotificationPref>>;
  let upsert: jest.Mock;
  let auditWrite: jest.Mock;

  const stubRepo = <T extends object>() =>
    ({
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      save: jest.fn(async (e: T) => e),
    }) as unknown as Repository<T>;

  beforeEach(() => {
    session = { id: 1, tenantId: 7, customerId: 42, sessionToken: 'tok' };
    prefFindResult = [];
    upsert = jest.fn(async () => ({ identifiers: [], generatedMaps: [], raw: {} }));
    auditWrite = jest.fn(async () => ({}));

    const sessionRepo = {
      findOne: jest.fn(async () => session),
      find: jest.fn(async () => []),
    } as unknown as Repository<Session>;
    const prefRepo = {
      upsert,
      find: jest.fn(async () => prefFindResult),
      findOne: jest.fn(async () => null),
    } as unknown as Repository<NotificationPref>;
    const audit = { write: auditWrite } as unknown as AuditService;
    const redis = { del: jest.fn() } as unknown as RedisService;

    svc = new PrivacyService(
      stubRepo(), // customer
      sessionRepo,
      stubRepo(), // order
      stubRepo(), // orderItem
      stubRepo(), // fulfillment
      stubRepo(), // conversation
      stubRepo(), // message
      stubRepo(), // notification
      prefRepo,
      stubRepo(), // review
      stubRepo(), // inquiry
      stubRepo(), // cjm
      stubRepo(), // affiliate
      stubRepo(), // subscription
      stubRepo(), // restock
      stubRepo(), // deviceToken
      stubRepo(), // campaign
      stubRepo(), // tenant
      stubRepo(), // productSave (F2 engagement)
      stubRepo(), // nudge (F2 engagement)
      // Widget-session authorization is delegated to SessionService (one gate for
      // every path that touches personal data), so it precedes audit/redis here.
      {
        requireCustomer: jest.fn(async () => session),
        requireCustomerId: jest.fn(async () => session.customerId),
      } as never,
      audit,
      redis,
      // Erasure suppression + upstream propagation: not exercised by the opt-out
      // suites, stubbed so the positional args stay aligned.
      { record: jest.fn(), isSuppressed: jest.fn(async () => false) } as never,
      { getShopifyConnection: jest.fn(async () => null) } as never,
      { requestCustomerErasure: jest.fn() } as never,
    );
  });

  it('opt-out bulk-upserts the full external channel x category grid (disabled)', async () => {
    await svc.setOptOut('tok', true);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, conflictPaths] = upsert.mock.calls[0];
    expect(conflictPaths).toEqual(['customerId', 'channel', 'category']);
    expect(rows).toHaveLength(EXTERNAL.length * CATEGORIES.length);
    for (const channel of EXTERNAL) {
      for (const category of CATEGORIES) {
        expect(rows).toContainEqual({ customerId: 42, channel, category, enabled: 0 });
      }
    }
    // in_app never appears in the grid — it stays always-on.
    expect(rows.some((r: NotificationPref) => r.channel === 'in_app')).toBe(false);

    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        actorType: 'user',
        action: 'ccpa.opt_out',
        result: 'success',
        metadata: { optOut: true, customerId: 42 },
      }),
    );
  });

  it('opt-back-in upserts the same grid with enabled=1', async () => {
    await svc.setOptOut('tok', false);
    const [rows] = upsert.mock.calls[0];
    expect(rows).toHaveLength(EXTERNAL.length * CATEGORIES.length);
    expect(rows.every((r: NotificationPref) => r.enabled === 1)).toBe(true);
  });

  it('getOptOutStatus: zero rows => false; all disabled => true; mixed => false', async () => {
    prefFindResult = [];
    await expect(svc.getOptOutStatus('tok')).resolves.toBe(false);

    prefFindResult = EXTERNAL.flatMap((channel) =>
      CATEGORIES.map((category) => ({ customerId: 42, channel, category, enabled: 0 })),
    );
    await expect(svc.getOptOutStatus('tok')).resolves.toBe(true);

    prefFindResult[0] = { ...prefFindResult[0], enabled: 1 };
    await expect(svc.getOptOutStatus('tok')).resolves.toBe(false);
  });
});
