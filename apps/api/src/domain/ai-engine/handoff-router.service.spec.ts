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

/**
 * Breaks (lunch) carve holes in the shift (PLN-260806): nobody is at the
 * console, so a question then must take the off-hours route rather than promise
 * a live agent. 16:30Z = 12:30 New York (EDT), inside the 12:00–13:00 break.
 */
describe('HandoffRouterService — breaks inside the shift', () => {
  const offHours = { email: 'cs@example.com' };
  const withBreak = (breaks: Array<{ start: string; end: string }>): HandoffConfig => ({
    businessHours: { ...HOURS!, breaks },
    offHours,
  });

  it('routes to email during the break', async () => {
    const route = await at('2026-08-06T16:30:00Z', () =>
      routerFor(withBreak([{ start: '12:00', end: '13:00' }])).route(1, 'EN'),
    );
    expect(route.mode).toBe('email');
    expect(route.email).toBe('cs@example.com');
  });

  it('routes to agents on either side of the break', async () => {
    const before = await at('2026-08-06T15:30:00Z', () =>
      routerFor(withBreak([{ start: '12:00', end: '13:00' }])).route(1, 'EN'),
    );
    const after = await at('2026-08-06T17:30:00Z', () =>
      routerFor(withBreak([{ start: '12:00', end: '13:00' }])).route(1, 'EN'),
    );
    expect(before.mode).toBe('agents');
    expect(after.mode).toBe('agents');
  });

  it('ignores a malformed or empty break instead of closing the shift', async () => {
    for (const breaks of [
      [{ start: '', end: '13:00' }],
      [{ start: '12:00', end: '12:00' }],
      [],
    ]) {
      const route = await at('2026-08-06T16:30:00Z', () =>
        routerFor(withBreak(breaks)).route(1, 'EN'),
      );
      expect(route.mode).toBe('agents');
    }
  });
});

/** Policy deny-list matching (P2, PLN-260808-Issue-Workflow-P2). */
describe('HandoffRouterService.denyMatch', () => {
  it('matches case-insensitively and returns the rule stamps', async () => {
    const svc = routerFor({
      denyRules: [
        { keywords: ['환불', 'refund'], type: 'refund', label: 'accounting' },
        { keywords: ['제휴'], type: 'partnership', label: 'operations' },
      ],
    });
    await expect(svc.denyMatch(1, '이 제품 REFUND 가능한가요?')).resolves.toEqual({
      type: 'refund',
      label: 'accounting',
      // A rule written before `mode` existed is silent — the behaviour its
      // author chose (REQ-260826).
      mode: 'silent',
    });
    await expect(svc.denyMatch(1, '제휴 문의드립니다')).resolves.toEqual({
      type: 'partnership',
      label: 'operations',
      mode: 'silent',
    });
  });

  it('returns null with no rules, no match, or blank keywords', async () => {
    await expect(routerFor(null).denyMatch(1, '배송 언제 오나요')).resolves.toBeNull();
    const svc = routerFor({ denyRules: [{ keywords: ['', '  '], type: 'other' }] });
    await expect(svc.denyMatch(1, '아무 질문')).resolves.toBeNull();
  });
});

describe('HandoffRouterService.denyMatch — per-rule mode (REQ-260826)', () => {
  const build = (rules: unknown[]) =>
    new HandoffRouterService({
      getHandoffConfig: jest.fn(async () => ({ denyRules: rules })),
    } as never);

  it('reads a rule with no mode as silent, never as answering', async () => {
    // Every deny rule in existence predates this field. Reading the absence as
    // "answer first" would start auto-replying on topics a tenant deliberately
    // routed to a person.
    const svc = build([{ keywords: ['환불계좌'] }]);

    await expect(svc.denyMatch(1, '환불계좌 바꾸고 싶어')).resolves.toMatchObject({
      mode: 'silent',
    });
  });

  it('carries answer_then_handoff through', async () => {
    const svc = build([{ keywords: ['환불계좌'], mode: 'answer_then_handoff' }]);

    await expect(svc.denyMatch(1, '환불계좌 바꾸고 싶어')).resolves.toMatchObject({
      mode: 'answer_then_handoff',
    });
  });
});
