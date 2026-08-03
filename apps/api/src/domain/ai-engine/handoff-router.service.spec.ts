import { HandoffRouterService } from './handoff-router.service';
import type { AiConfigService } from './ai-config.service';
import type { HandoffConfig } from './entity/tenant-ai-config.entity';

/**
 * Business-hours routing (PLN-AiSetting W3). Time is frozen per case so the
 * timezone/day/boundary maths is deterministic — these are the decisions that
 * send a customer to an agent versus an off-hours mailbox.
 */
function routerFor(config: HandoffConfig | null): HandoffRouterService {
  return new HandoffRouterService({
    getHandoffConfig: async () => config,
  } as unknown as AiConfigService);
}

const HOURS: HandoffConfig['businessHours'] = {
  timezone: 'America/New_York',
  days: [1, 2, 3, 4, 5], // Mon–Fri
  start: '09:00',
  end: '18:00',
};

/** Freeze the clock at a UTC instant for the duration of one assertion. */
async function at<T>(utcIso: string, run: () => Promise<T>): Promise<T> {
  jest.useFakeTimers().setSystemTime(new Date(utcIso));
  try {
    return await run();
  } finally {
    jest.useRealTimers();
  }
}

describe('HandoffRouterService', () => {
  const offHours = { email: 'cs@example.com', notice: { KO: '지금은 상담 시간이 아니에요.' } };

  it('routes to agents when no config exists (historic broadcast behaviour)', async () => {
    const route = await routerFor(null).route(1, 'EN');
    expect(route).toEqual({ mode: 'agents', targetUserIds: [] });
  });

  it('passes the configured assignees through', async () => {
    const route = await routerFor({ assigneeUserIds: [3, 7] }).route(1, 'EN');
    expect(route.targetUserIds).toEqual([3, 7]);
  });

  it('routes to agents inside business hours', async () => {
    // Wed 2026-08-05 14:00 UTC = 10:00 America/New_York (EDT).
    const route = await at('2026-08-05T14:00:00Z', () =>
      routerFor({ businessHours: HOURS, offHours }).route(1, 'KO'),
    );
    expect(route.mode).toBe('agents');
  });

  it('routes to email outside business hours, with the tenant notice', async () => {
    // Wed 2026-08-05 03:00 UTC = 23:00 the previous evening in New York.
    const route = await at('2026-08-05T03:00:00Z', () =>
      routerFor({ businessHours: HOURS, offHours }).route(1, 'KO'),
    );
    expect(route.mode).toBe('email');
    expect(route.email).toBe('cs@example.com');
    expect(route.notice).toBe('지금은 상담 시간이 아니에요.');
  });

  it('falls back to the built-in notice for a language the tenant did not translate', async () => {
    const route = await at('2026-08-05T03:00:00Z', () =>
      routerFor({ businessHours: HOURS, offHours }).route(1, 'ES'),
    );
    // No ES override and no EN override → built-in Spanish wording.
    expect(route.notice).toContain('horario de atención');
  });

  it('treats a day outside the configured week as off hours', async () => {
    // Sat 2026-08-08 14:00 UTC = 10:00 New York, but Saturday is not a work day.
    const route = await at('2026-08-08T14:00:00Z', () =>
      routerFor({ businessHours: HOURS, offHours }).route(1, 'EN'),
    );
    expect(route.mode).toBe('email');
  });

  it('keeps paging agents off-hours when no mailbox is configured', async () => {
    // Dropping the escalation would lose the customer's request entirely.
    const route = await at('2026-08-05T03:00:00Z', () =>
      routerFor({ businessHours: HOURS }).route(1, 'EN'),
    );
    expect(route.mode).toBe('agents');
  });

  it('handles an overnight window that spans midnight', async () => {
    const overnight: HandoffConfig = {
      businessHours: { timezone: 'UTC', days: [1, 2, 3, 4, 5], start: '22:00', end: '06:00' },
      offHours,
    };
    // Tue 02:00 UTC belongs to Monday's 22:00→06:00 shift.
    await at('2026-08-04T02:00:00Z', async () => {
      expect((await routerFor(overnight).route(1, 'EN')).mode).toBe('agents');
    });
    // Tue 12:00 UTC is squarely outside it.
    await at('2026-08-04T12:00:00Z', async () => {
      expect((await routerFor(overnight).route(1, 'EN')).mode).toBe('email');
    });
  });

  it('never blocks on a malformed time range', async () => {
    const route = await at('2026-08-05T03:00:00Z', () =>
      routerFor({
        businessHours: { timezone: 'UTC', days: [1], start: 'oops', end: '18:00' },
        offHours,
      }).route(1, 'EN'),
    );
    expect(route.mode).toBe('agents');
  });
});
