import { Repository } from 'typeorm';
import { PushService } from './push.service';
import { DeviceToken } from './entity/device-token.entity';
import { Session } from '../session/entity/session.entity';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { PushProvider, PushTicket } from './provider/push-provider.interface';
import { BusinessException } from '../../global/exception/business.exception';

const EXPO_TOKEN = 'ExponentPushToken[abc123]';

describe('PushService (REQ-MobileApp M1 — registration + dispatch)', () => {
  let svc: PushService;
  let tokenRows: DeviceToken[];
  let sessions: Map<string, Partial<Session>>;
  let sendMock: jest.Mock<Promise<PushTicket[]>, never[]>;
  let updateMock: jest.Mock;

  beforeEach(() => {
    tokenRows = [];
    sessions = new Map();
    sendMock = jest.fn(async () => [] as PushTicket[]);
    updateMock = jest.fn(async () => ({ affected: 1 }));

    const tokenRepo = {
      findOne: jest.fn(async ({ where }: { where: { token: string } }) => {
        return tokenRows.find((t) => t.token === where.token) ?? null;
      }),
      find: jest.fn(async ({ where }: { where: { customerId: number; tenantId?: number } }) => {
        return tokenRows.filter(
          (t) =>
            t.customerId === where.customerId &&
            t.revokedAt == null &&
            (where.tenantId === undefined || t.tenantId === where.tenantId),
        );
      }),
      create: jest.fn((e: Partial<DeviceToken>) => e as DeviceToken),
      save: jest.fn(async (e: DeviceToken) => {
        const idx = tokenRows.findIndex((t) => t.token === e.token);
        if (idx >= 0) tokenRows[idx] = e;
        else tokenRows.push(e);
        return e;
      }),
      update: updateMock,
    } as unknown as Repository<DeviceToken>;

    const sessionRepo = {
      findOne: jest.fn(async ({ where }: { where: { sessionToken: string } }) => {
        return (sessions.get(where.sessionToken) as Session) ?? null;
      }),
    } as unknown as Repository<Session>;

    const bus = { subscribe: jest.fn(), publish: jest.fn() } as unknown as EventBusService;
    const provider: PushProvider = { send: sendMock, getReceipts: jest.fn(async () => []) };

    svc = new PushService(tokenRepo, sessionRepo, provider, bus);
  });

  const session = (token: string, over: Partial<Session> = {}): void => {
    sessions.set(token, { id: 10, tenantId: 1, customerId: null, ...over });
  };

  it('register: creates a row bound to the session tenant (anonymous)', async () => {
    session('s1');
    const row = await svc.register('s1', { token: EXPO_TOKEN, platform: 'ios' });
    expect(row.tenantId).toBe(1);
    expect(row.customerId).toBeNull();
    expect(row.revokedAt).toBeNull();
    expect(tokenRows).toHaveLength(1);
  });

  it('register: re-registration rebinds the token to the upgraded customer', async () => {
    session('s1');
    await svc.register('s1', { token: EXPO_TOKEN, platform: 'ios' });
    session('s2', { id: 11, customerId: 42 });
    const row = await svc.register('s2', { token: EXPO_TOKEN, platform: 'ios' });
    expect(row.customerId).toBe(42);
    expect(tokenRows).toHaveLength(1); // upsert, not duplicate
  });

  it('register: malformed token rejected with E5006', async () => {
    session('s1');
    await expect(
      svc.register('s1', { token: 'not-a-push-token', platform: 'android' }),
    ).rejects.toThrow(BusinessException);
  });

  it('register: unknown session token → SESSION_NOT_FOUND', async () => {
    await expect(svc.register('nope', { token: EXPO_TOKEN, platform: 'ios' })).rejects.toThrow(
      BusinessException,
    );
  });

  it('unregister: revokes and is idempotent', async () => {
    session('s1');
    await svc.register('s1', { token: EXPO_TOKEN, platform: 'ios' });
    await svc.unregister('s1', EXPO_TOKEN);
    expect(tokenRows[0].revokedAt).not.toBeNull();
    await expect(svc.unregister('s1', EXPO_TOKEN)).resolves.toBeUndefined();
  });

  it('dispatch: sends one message per active device of the customer', async () => {
    tokenRows.push(
      { token: 'ExponentPushToken[a]', customerId: 42, tenantId: 1, revokedAt: null } as DeviceToken,
      { token: 'ExponentPushToken[b]', customerId: 42, tenantId: 1, revokedAt: null } as DeviceToken,
      { token: 'ExponentPushToken[c]', customerId: 99, tenantId: 1, revokedAt: null } as DeviceToken,
    );
    await svc.dispatch({
      notificationId: 5,
      tenantId: 1,
      customerId: 42,
      category: 'shipping',
      title: 'Shipping update',
      body: 'On the way',
      statusBadge: 'In Transit',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const messages = sendMock.mock.calls[0][0] as unknown as Array<{ to: string; data: Record<string, unknown> }>;
    expect(messages.map((m) => m.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    expect(messages[0].data).toMatchObject({ category: 'shipping', notificationId: 5 });
  });

  it('dispatch: null customer is a no-op (fail-closed upstream)', async () => {
    await svc.dispatch({
      notificationId: 5,
      tenantId: 1,
      customerId: null,
      category: 'shipping',
      title: 't',
      body: null,
      statusBadge: null,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('dispatch: DeviceNotRegistered ticket revokes the token', async () => {
    tokenRows.push({
      token: 'ExponentPushToken[dead]',
      customerId: 42,
      tenantId: 1,
      revokedAt: null,
    } as DeviceToken);
    sendMock.mockResolvedValueOnce([
      { token: 'ExponentPushToken[dead]', ok: false, shouldRevoke: true, error: 'DeviceNotRegistered' },
    ]);
    await svc.dispatch({
      notificationId: 6,
      tenantId: 1,
      customerId: 42,
      category: 'chat',
      title: 't',
      body: null,
      statusBadge: null,
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'ExponentPushToken[dead]' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
