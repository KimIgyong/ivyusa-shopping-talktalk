import { Repository } from 'typeorm';
import { CONSENT_STATE } from '@ivy/types';
import { CONSENT_NOTICE_VERSION, SessionService, sessionCacheKey } from './session.service';
import { Session } from './entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { EventBusService } from '../../infrastructure/infrastructure.module';
import { RedisService } from '../../infrastructure/cache/redis.service';

/** In-memory Redis stand-in with the availability flag the service consults. */
class FakeRedis {
  up = true;
  store = new Map<string, string>();
  available(): boolean {
    return this.up;
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('SessionService consent (PLN-Privacy-Control-Gap Stage 1-2)', () => {
  let svc: SessionService;
  let redis: FakeRedis;
  let session: Session;
  let tenant: Tenant | null;

  const bus = { publish: jest.fn() } as unknown as EventBusService;

  beforeEach(() => {
    session = {
      id: 11,
      sessionToken: 'tok-11',
      tenantId: 1,
      customerId: null,
      identityLevel: 'guest',
      language: 'EN',
      consentState: CONSENT_STATE.PENDING,
      consentAt: null,
      consentVersion: null,
    } as Session;
    tenant = {
      id: 1,
      privacyPolicyUrl: null,
      consentNoticeVersion: null,
    } as Tenant;

    const sessionRepo = {
      findOne: jest.fn(async () => session),
      save: jest.fn(async (s: Session) => s),
    } as unknown as Repository<Session>;
    const tenantRepo = {
      findOne: jest.fn(async () => tenant),
      findAndCount: jest.fn(async () => [[tenant], 1]),
    } as unknown as Repository<Tenant>;

    redis = new FakeRedis();
    svc = new SessionService(sessionRepo, tenantRepo, bus, redis as unknown as RedisService);
  });

  describe('setConsent', () => {
    it('grants: stamps state, timestamp, effective version and invalidates the cache', async () => {
      redis.store.set(sessionCacheKey('tok-11'), JSON.stringify(session));
      const saved = await svc.setConsent('tok-11', true);
      expect(saved.consentState).toBe(CONSENT_STATE.GRANTED);
      expect(saved.consentAt).toBeInstanceOf(Date);
      expect(saved.consentVersion).toBe(CONSENT_NOTICE_VERSION);
      expect(redis.store.has(sessionCacheKey('tok-11'))).toBe(false);
    });

    it('declines: records declined with the same audit fields', async () => {
      const saved = await svc.setConsent('tok-11', false);
      expect(saved.consentState).toBe(CONSENT_STATE.DECLINED);
      expect(saved.consentAt).toBeInstanceOf(Date);
      expect(saved.consentVersion).toBe(CONSENT_NOTICE_VERSION);
    });

    it('stamps the tenant-overridden notice version when set', async () => {
      tenant!.consentNoticeVersion = '2026-08-custom';
      const saved = await svc.setConsent('tok-11', true);
      expect(saved.consentVersion).toBe('2026-08-custom');
    });
  });

  describe('getEffectiveConsent', () => {
    const v = '2026-07';
    it.each([
      [CONSENT_STATE.GRANTED, v, CONSENT_STATE.GRANTED], // current grant counts
      [CONSENT_STATE.GRANTED, '2025-01', CONSENT_STATE.PENDING], // outdated → re-consent
      [CONSENT_STATE.GRANTED, null, CONSENT_STATE.PENDING], // no version recorded
      [CONSENT_STATE.DECLINED, v, CONSENT_STATE.DECLINED],
      [CONSENT_STATE.PENDING, null, CONSENT_STATE.PENDING],
    ])('state=%s version=%s → %s', (consentState, consentVersion, expected) => {
      const row = { consentState, consentVersion } as Pick<
        Session,
        'consentState' | 'consentVersion'
      >;
      expect(svc.getEffectiveConsent(row, v)).toBe(expected);
    });
  });

  describe('effective notice version / privacy notice', () => {
    it('falls back to the platform constant when the tenant has no override', async () => {
      await expect(svc.effectiveNoticeVersion(1)).resolves.toBe(CONSENT_NOTICE_VERSION);
    });

    it('falls back when the session has no tenant', async () => {
      await expect(svc.effectiveNoticeVersion(null)).resolves.toBe(CONSENT_NOTICE_VERSION);
    });

    it('uses the tenant override and exposes the policy URL', async () => {
      tenant!.consentNoticeVersion = 'v9';
      tenant!.privacyPolicyUrl = 'https://shop.example/privacy';
      await expect(svc.privacyNotice(1)).resolves.toEqual({
        privacyPolicyUrl: 'https://shop.example/privacy',
        consentNoticeVersion: 'v9',
      });
    });
  });

  describe('effectiveConsentFor (fresh, cache-bypassing read)', () => {
    it('ignores a stale cached GRANTED: the DB row wins (fail-closed)', async () => {
      // Cache says granted…
      redis.store.set(
        sessionCacheKey('tok-11'),
        JSON.stringify({ ...session, consentState: CONSENT_STATE.GRANTED, consentVersion: CONSENT_NOTICE_VERSION }),
      );
      // …but the DB row (fresh read) says declined.
      session.consentState = CONSENT_STATE.DECLINED;
      await expect(svc.effectiveConsentFor(11, 1)).resolves.toBe(CONSENT_STATE.DECLINED);
    });

    it('degrades an outdated grant to pending', async () => {
      session.consentState = CONSENT_STATE.GRANTED;
      session.consentVersion = 'ancient';
      await expect(svc.effectiveConsentFor(11, 1)).resolves.toBe(CONSENT_STATE.PENDING);
    });

    it('returns granted for a current grant', async () => {
      session.consentState = CONSENT_STATE.GRANTED;
      session.consentVersion = CONSENT_NOTICE_VERSION;
      await expect(svc.effectiveConsentFor(11, 1)).resolves.toBe(CONSENT_STATE.GRANTED);
    });
  });
});
