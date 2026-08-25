import {
  classifyOutcome,
  loopsIn,
  median,
  RESOLUTION_REASON,
  UNRESOLVED_REASON,
} from './journey-metrics.service';

const msg = (senderType: string) => ({ senderType }) as never;
const conv = (over: Record<string, unknown> = {}) =>
  ({ status: 'ended', csatRating: null, endedAt: new Date(), ...over }) as never;

describe('classifyOutcome', () => {
  it('counts a CSAT answer as resolved, whatever else happened', () => {
    // The customer told us it was over. Nothing else needs inferring.
    expect(classifyOutcome(conv({ csatRating: 4 }), [], false)).toEqual({
      resolved: true,
      reason: RESOLUTION_REASON.CSAT_ANSWERED,
    });
  });

  it('counts an agent close as resolved', () => {
    expect(classifyOutcome(conv(), [msg('agent')], false)).toEqual({
      resolved: true,
      reason: RESOLUTION_REASON.AGENT_CLOSED,
    });
  });

  it('counts prompted-then-closed as resolved when we spoke last', () => {
    // The answer was given and the customer simply stopped.
    const messages = [msg('user'), msg('agent'), msg('system')];

    expect(classifyOutcome(conv(), messages, true)).toEqual({
      resolved: true,
      reason: RESOLUTION_REASON.PROMPTED_CLOSED,
    });
  });

  it('does NOT count prompted-then-closed when the customer spoke last', () => {
    // Same message, same end state, opposite meaning: a question left hanging.
    // Counted together, abandoned threads land in the resolved column and their
    // share grows as service gets worse.
    const messages = [msg('agent'), msg('user'), msg('system')];

    expect(classifyOutcome(conv(), messages, true)).toEqual({
      resolved: false,
      reason: UNRESOLVED_REASON.CUSTOMER_LAST,
    });
  });

  it('ignores the system prompt itself when deciding who spoke last', () => {
    // The sweeper's "anything else?" is a system message; if it counted, every
    // prompted conversation would look answered by us.
    const messages = [msg('agent'), msg('user'), msg('system'), msg('system')];

    expect(classifyOutcome(conv(), messages, true).resolved).toBe(false);
  });

  it('treats a still-open conversation as unresolved, not as fast', () => {
    expect(classifyOutcome(conv({ status: 'agent' }), [msg('user')], false)).toEqual({
      resolved: false,
      reason: UNRESOLVED_REASON.OPEN,
    });
  });

  it('treats an end with no timestamp as abandoned', () => {
    expect(classifyOutcome(conv({ endedAt: null }), [msg('user')], false)).toEqual({
      resolved: false,
      reason: UNRESOLVED_REASON.ABANDONED,
    });
  });
});

describe('loopsIn', () => {
  it('counts speaker changes, not messages', () => {
    expect(loopsIn([msg('user'), msg('agent')])).toBe(1);
    expect(loopsIn([msg('user'), msg('user'), msg('agent')])).toBe(1);
    expect(loopsIn([msg('user'), msg('agent'), msg('user'), msg('agent')])).toBe(3);
  });

  it('does not let system messages fake a turn', () => {
    expect(loopsIn([msg('user'), msg('system'), msg('user')])).toBe(0);
  });
});

describe('median', () => {
  it('is not dragged by a long tail the way a mean is', () => {
    // One thread reopened weeks later would put the mean above every real case.
    const values = [5, 6, 7, 8, 40_000];
    expect(median(values)).toBe(7);
  });

  it('averages the middle pair on an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('reports nothing rather than zero when there is nothing to measure', () => {
    // Zero minutes would read as instant resolution.
    expect(median([])).toBeNull();
  });
});
