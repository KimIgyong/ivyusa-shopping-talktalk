import { AnalyticsService } from './analytics.service';
import { RESOLUTION_REASON, classifyOutcome } from '../../global/util/resolution.util';

/**
 * Dashboard KPIs (AN-260826 P0).
 *
 * Two properties, both invisible from the screen: sandbox threads are not
 * customer conversations, and "resolved" means what the journey report means by
 * it. Neither shows up as an error — the card just prints a number.
 */
describe('AnalyticsService — dashboard counting rules', () => {
  const captured: string[] = [];
  const qb: Record<string, unknown> = {};
  for (const m of ['where', 'andWhere', 'select', 'addSelect', 'groupBy', 'orderBy', 'limit']) {
    qb[m] = (arg: unknown) => {
      if (typeof arg === 'string') captured.push(arg);
      return qb;
    };
  }
  qb.getCount = async () => 0;
  qb.getMany = async () => [];
  qb.getRawMany = async () => [];
  qb.getRawOne = async () => ({});

  const build = () =>
    new AnalyticsService(
      { createQueryBuilder: () => qb, count: async () => 0 } as never,
      { createQueryBuilder: () => qb, find: async () => [] } as never,
      { createQueryBuilder: () => qb } as never,
      {} as never,
      { count: async () => 0 } as never,
      {} as never,
      {} as never,
      {} as never,
      { createQueryBuilder: () => qb } as never,
      { createQueryBuilder: () => qb } as never,
      { available: () => false, get: async () => null, set: async () => undefined } as never,
    );

  it('excludes preview threads from every conversation count', async () => {
    // Conversation search has always excluded them; the dashboard counted them.
    // On staging that was 26% of one tenant's conversations.
    captured.length = 0;

    await build().dashboard(1);

    const previewGuards = captured.filter((c) => c.includes("ps.channel = 'preview'"));
    expect(previewGuards.length).toBeGreaterThanOrEqual(3);
  });
});

describe('resolution definition is shared, not re-implemented', () => {
  const conv = (over: Record<string, unknown> = {}) =>
    ({ status: 'ended', csatRating: null, endedAt: new Date(), ...over }) as never;

  it('does not count a conversation the customer was left hanging in', () => {
    // The old dashboard rule — ended and not escalated — scored exactly this
    // case as a success, and its share grows as service gets worse.
    expect(classifyOutcome(conv(), 'user', true).resolved).toBe(false);
  });

  it('counts an agent close', () => {
    expect(classifyOutcome(conv(), 'agent', false)).toEqual({
      resolved: true,
      reason: RESOLUTION_REASON.AGENT_CLOSED,
    });
  });
});
