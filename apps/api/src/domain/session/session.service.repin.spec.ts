import { SessionService, sessionCacheKey } from './session.service';
import { Session } from './entity/session.entity';
import { RedisService } from '../../infrastructure/cache/redis.service';

/**
 * FIX-260825 — the widget persists its session token, so ensure() reusing a
 * session must honour the PAGE's declared agent: a visitor walking from the
 * main page (default pin) to /partner (hotel-partner embed) kept the old pin
 * forever, which made agent-scoped scenario buttons look unfiltered. An
 * explicit resolvable code re-pins; an absent or unknown code changes nothing.
 */
describe('SessionService.ensure — agent re-pin on reuse', () => {
  function build(opts: { pinned?: number | null; agents?: Array<{ id: number; code: string }> } = {}) {
    const session = {
      id: 40,
      sessionToken: 'tok-40',
      tenantId: 4,
      aiAgentId: opts.pinned ?? null,
    } as unknown as Session;
    const updates: Array<Record<string, unknown>> = [];
    const sessionRepo = {
      findOne: jest.fn(async () => session),
      update: jest.fn(async (_w: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { affected: 1 };
      }),
    };
    const aiAgentRepo = {
      findOne: jest.fn(async (q: { where: { code: string } }) =>
        (opts.agents ?? []).find((a) => a.code === q.where.code) ?? null,
      ),
    };
    const deleted: string[] = [];
    const redis = {
      available: () => true,
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(async (k: string) => {
        deleted.push(k);
      }),
    };
    const svc = new SessionService(
      sessionRepo as never,
      { findOne: jest.fn(async () => null) } as never,
      {} as never,
      { publish: jest.fn() } as never,
      redis as unknown as RedisService,
      aiAgentRepo as never,
    );
    return { svc, session, updates, deleted };
  }

  it('re-pins an existing session when the page declares a DIFFERENT agent', async () => {
    const h = build({ pinned: 5, agents: [{ id: 10, code: 'hotel-partner' }] });

    const s = await h.svc.ensure('tok-40', 'ko', undefined, undefined, 'hotel-partner');

    expect(h.updates[0]).toEqual({ aiAgentId: 10 });
    expect(s.aiAgentId).toBe(10);
    // The 30s token→session cache would keep serving the old pin otherwise.
    expect(h.deleted).toContain(sessionCacheKey('tok-40'));
  });

  it('re-pins a NULL (default) pin too — /partner over a main-page session', async () => {
    const h = build({ pinned: null, agents: [{ id: 10, code: 'hotel-partner' }] });

    const s = await h.svc.ensure('tok-40', 'ko', undefined, undefined, 'hotel-partner');

    expect(s.aiAgentId).toBe(10);
  });

  it('same agent → no write, no cache bust', async () => {
    const h = build({ pinned: 10, agents: [{ id: 10, code: 'hotel-partner' }] });

    await h.svc.ensure('tok-40', 'ko', undefined, undefined, 'hotel-partner');

    expect(h.updates).toHaveLength(0);
    expect(h.deleted).toHaveLength(0);
  });

  it('absent agent code keeps the existing pin (never resets to default)', async () => {
    const h = build({ pinned: 10 });

    const s = await h.svc.ensure('tok-40', 'ko');

    expect(s.aiAgentId).toBe(10);
    expect(h.updates).toHaveLength(0);
  });

  it('unknown agent code keeps the existing pin', async () => {
    const h = build({ pinned: 10, agents: [] });

    const s = await h.svc.ensure('tok-40', 'ko', undefined, undefined, 'nope');

    expect(s.aiAgentId).toBe(10);
    expect(h.updates).toHaveLength(0);
  });
});
