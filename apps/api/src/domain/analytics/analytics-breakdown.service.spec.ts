import { inZone, median } from './analytics-breakdown.service';

/**
 * The two calculations in these lenses that can be wrong without looking wrong.
 */
describe('median message count', () => {
  it('is not moved by one enormous room', () => {
    // KakaoTalk averages 131.7 messages per conversation on staging because a
    // few group rooms run to hundreds of turns. The mean describes none of the
    // conversations; the median describes the typical one, and showing both is
    // what makes the skew visible instead of quietly reported as normal.
    const sizes = [3, 4, 5, 6, 900];

    expect(median(sizes)).toBe(5);
  });

  it('averages the middle pair on an even count', () => {
    expect(median([2, 4, 6, 8])).toBe(5);
  });

  it('is zero for nothing rather than NaN', () => {
    expect(median([])).toBe(0);
  });
});

describe('hour-of-day in the tenant timezone', () => {
  it('puts a Seoul afternoon in the afternoon', () => {
    // 06:00 UTC is 15:00 in Seoul. Drawn in UTC the shop's busiest hour appears
    // at dawn — not a rounding error, the opposite of the answer.
    const at = new Date('2026-08-26T06:00:00Z');

    expect(inZone(at, 'Asia/Seoul').hour).toBe(15);
    expect(inZone(at, 'UTC').hour).toBe(6);
  });

  it('rolls the weekday over with the clock', () => {
    // Late Tuesday in UTC is already Wednesday in Seoul.
    const at = new Date('2026-08-25T23:30:00Z');

    expect(inZone(at, 'UTC').weekday).toBe(2);
    expect(inZone(at, 'Asia/Seoul').weekday).toBe(3);
  });

  it('reports midnight as hour 0, not 24', () => {
    // Intl's h23/h24 boundary: an hour cycle that returns 24 would write past
    // the end of the row and lose the busiest hour of a night shift.
    const at = new Date('2026-08-26T15:00:00Z');

    expect(inZone(at, 'Asia/Seoul').hour).toBe(0);
  });
});
