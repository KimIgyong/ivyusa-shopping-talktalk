import { parseFrom, parseTo, toDateKey } from './date-range.util';

describe('date-range.util', () => {
  it('returns undefined for absent or unparseable input', () => {
    for (const v of [undefined, '', 'yesterday', '2026-13-45x']) {
      expect(parseFrom(v)).toBeUndefined();
      expect(parseTo(v)).toBeUndefined();
    }
  });

  it('parses a bare date as local midnight for the lower bound', () => {
    const d = parseFrom('2026-08-04')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(0);
  });

  it('widens a bare upper-bound date to the next midnight (exclusive)', () => {
    // Without this, `to=2026-08-04` means "< 2026-08-04 00:00" and silently
    // excludes everything that happened on the day the user picked.
    const d = parseTo('2026-08-04')!;
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0);
  });

  it('passes a full ISO instant through unchanged on both bounds', () => {
    const iso = '2026-08-04T09:12:00.000Z';
    expect(parseFrom(iso)!.toISOString()).toBe(iso);
    expect(parseTo(iso)!.toISOString()).toBe(iso);
  });

  it('formats a local date key with zero padding', () => {
    expect(toDateKey(new Date(2026, 0, 9))).toBe('2026-01-09');
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('month boundary: widening the last day of a month rolls into the next', () => {
    expect(toDateKey(parseTo('2026-01-31')!)).toBe('2026-02-01');
  });
});
