import { parseFrom, parseTo, toDateKey, utcDayBounds } from './date-range.util';

describe('date-range.util', () => {
  it('returns undefined for absent or unparseable input', () => {
    for (const v of [undefined, '', 'yesterday', '2026-13-45x']) {
      expect(parseFrom(v)).toBeUndefined();
      expect(parseTo(v)).toBeUndefined();
    }
  });

  it('anchors a bare date to UTC midnight, not the host timezone', () => {
    // The DB connection binds dates as UTC and the containers run UTC; parsing
    // in server-local time shifted every window by the host offset, so a day's
    // rows landed under the wrong date depending on where the process ran.
    expect(parseFrom('2026-08-04')!.toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it('widens a bare upper-bound date to the next UTC midnight (exclusive)', () => {
    // Without this, `to=2026-08-04` means "< 2026-08-04 00:00" and silently
    // excludes everything that happened on the day the user picked.
    expect(parseTo('2026-08-04')!.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('passes a full ISO instant through unchanged on both bounds', () => {
    const iso = '2026-08-04T09:12:00.000Z';
    expect(parseFrom(iso)!.toISOString()).toBe(iso);
    expect(parseTo(iso)!.toISOString()).toBe(iso);
  });

  it('formats a UTC date key', () => {
    expect(toDateKey(new Date('2026-01-09T23:30:00.000Z'))).toBe('2026-01-09');
    expect(toDateKey(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31');
  });

  it('month boundary: widening the last day of a month rolls into the next', () => {
    expect(toDateKey(parseTo('2026-01-31')!)).toBe('2026-02-01');
  });

  it('utcDayBounds spans exactly one day', () => {
    const { start, end } = utcDayBounds('2026-08-04');
    expect(start.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-05T00:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it('a key round-trips through bounds unchanged', () => {
    expect(toDateKey(utcDayBounds('2026-03-01').start)).toBe('2026-03-01');
  });
});
