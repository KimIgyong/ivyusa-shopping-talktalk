import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { Notification } from './entity/notification.entity';
import { NotificationPref } from './entity/notification-pref.entity';
import { Session } from '../session/entity/session.entity';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';

const EXTERNAL = ['email', 'sms', 'web_push', 'push'];
const CATEGORIES = ['payment', 'shipping', 'event', 'review', 'chat'];

describe('NotificationService.isSuppressed / notify (Stage 6 — D-4 fail-closed suppression)', () => {
  let svc: NotificationService;
  let busPublish: jest.Mock;
  /** (customerId:channel:category) -> enabled(0|1); absent key = no pref row. */
  let prefRows: Map<string, number>;

  const key = (c: number, ch: string, cat: string) => `${c}:${ch}:${cat}`;

  beforeEach(() => {
    prefRows = new Map();
    const notifRepo = {
      create: jest.fn((e: Partial<Notification>) => e as Notification),
      save: jest.fn(async (e: Notification) => e),
    } as unknown as Repository<Notification>;
    const prefRepo = {
      findOne: jest.fn(async ({ where }: { where: { customerId: number; channel: string; category: string } }) => {
        const enabled = prefRows.get(key(where.customerId, where.channel, where.category));
        if (enabled === undefined) return null;
        return { customerId: where.customerId, channel: where.channel, category: where.category, enabled } as NotificationPref;
      }),
    } as unknown as Repository<NotificationPref>;
    const sessionRepo = {} as unknown as Repository<Session>;
    busPublish = jest.fn();
    const bus = { subscribe: jest.fn(), publish: busPublish } as unknown as EventBusService;
    const redis = {
      del: jest.fn(),
      get: jest.fn(async () => null),
      set: jest.fn(),
      available: () => false,
    } as unknown as RedisService;
    // sessionService sits between sessionRepo and bus — it is the shared widget-session
    // authorization gate. Unused by these suppression suites, but its position matters:
    // omitting it shifted bus into its slot and redis into bus's.
    const sessionService = {
      requireCustomerId: jest.fn(),
      requireCustomer: jest.fn(),
    } as never;
    svc = new NotificationService(notifRepo, prefRepo, sessionRepo, sessionService, bus, redis);
  });

  const channelsOf = (rows: Notification[]) => rows.map((r) => r.channel).sort();

  it('null customer: all external suppressed (fail-closed), in_app kept', async () => {
    const rows = await svc.notify({ customerId: null, category: 'payment', title: 't' });
    expect(channelsOf(rows)).toEqual(['in_app']);
  });

  it('marketing category with no pref row: external suppressed (default-deny)', async () => {
    const rows = await svc.notify({ customerId: 1, category: 'event', title: 't' });
    expect(channelsOf(rows)).toEqual(['in_app']);
  });

  it('transactional category with no pref row: external allowed (incl. push)', async () => {
    const rows = await svc.notify({ customerId: 1, category: 'shipping', title: 't' });
    expect(channelsOf(rows)).toEqual(['email', 'in_app', 'push', 'sms', 'web_push']);
  });

  it('chat category is transactional: push allowed with no pref row', async () => {
    const rows = await svc.notify({ customerId: 1, category: 'chat', title: 't', channel: 'push' });
    expect(channelsOf(rows)).toEqual(['in_app', 'push']);
  });

  it('explicitly disabled row suppresses just that channel', async () => {
    prefRows.set(key(1, 'email', 'payment'), 0);
    const rows = await svc.notify({ customerId: 1, category: 'payment', title: 't' });
    expect(channelsOf(rows)).toEqual(['in_app', 'push', 'sms', 'web_push']);
  });

  it('full opt-out (every external row disabled): zero external, in_app kept', async () => {
    for (const ch of EXTERNAL) for (const cat of CATEGORIES) prefRows.set(key(1, ch, cat), 0);
    for (const cat of CATEGORIES) {
      const rows = await svc.notify({ customerId: 1, category: cat, title: 't' });
      expect(channelsOf(rows)).toEqual(['in_app']);
    }
  });

  it('re-consent (rows re-enabled) resumes external sends, incl. marketing', async () => {
    for (const ch of EXTERNAL) for (const cat of CATEGORIES) prefRows.set(key(1, ch, cat), 1);
    const marketing = await svc.notify({ customerId: 1, category: 'event', title: 't' });
    expect(channelsOf(marketing)).toEqual(['email', 'in_app', 'push', 'sms', 'web_push']);
  });

  it('push row publishes EVENTS.PUSH_DISPATCH with tenant/customer context', async () => {
    const rows = await svc.notify({
      tenantId: 7,
      customerId: 1,
      category: 'shipping',
      title: 't',
      channel: 'push',
    });
    expect(channelsOf(rows)).toEqual(['in_app', 'push']);
    expect(busPublish).toHaveBeenCalledWith(
      'push.dispatch',
      expect.objectContaining({ tenantId: 7, customerId: 1, category: 'shipping' }),
    );
  });

  it('tenantId is stamped on created rows (detached-handler G4 fix)', async () => {
    const rows = await svc.notify({ tenantId: 7, customerId: 1, category: 'payment', title: 't' });
    for (const r of rows) expect(r.tenantId).toBe(7);
  });

  it('isSuppressed matrix directly', async () => {
    // no row
    await expect(svc.isSuppressed(null, 'email', 'payment')).resolves.toBe(true);
    await expect(svc.isSuppressed(2, 'email', 'payment')).resolves.toBe(false);
    await expect(svc.isSuppressed(2, 'email', 'shipping')).resolves.toBe(false);
    await expect(svc.isSuppressed(2, 'email', 'event')).resolves.toBe(true);
    await expect(svc.isSuppressed(2, 'email', 'review')).resolves.toBe(true);
    // explicit rows override defaults both ways
    prefRows.set(key(2, 'email', 'payment'), 0);
    prefRows.set(key(2, 'sms', 'review'), 1);
    await expect(svc.isSuppressed(2, 'email', 'payment')).resolves.toBe(true);
    await expect(svc.isSuppressed(2, 'sms', 'review')).resolves.toBe(false);
  });
});
