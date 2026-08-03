/**
 * Query-string date range parsing, shared by the audit, history and statistics
 * endpoints so all three read `from`/`to` identically.
 *
 * **Date-only values are interpreted in UTC.** The database connection binds
 * dates as UTC (`timezone: 'Z'` in data-source.ts) and the containers run UTC,
 * while a developer machine may not — parsing a bare date in server-local time
 * silently shifts every window by the host's offset, so a day's statistics land
 * under the wrong date depending on where the process happens to run.
 *
 * Full ISO-8601 instants are passed through as given; only the bare
 * `YYYY-MM-DD` shorthand is anchored to UTC midnight.
 *
 * The upper bound is EXCLUSIVE, and a bare date is widened to the end of that
 * day — otherwise `to=2026-08-04` would silently drop everything that happened
 * on the 4th, which is the day a user picking "through today" actually wants.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an inclusive lower bound. Returns undefined for absent/invalid input. */
export function parseFrom(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Parse an exclusive upper bound, widening a bare date to the next UTC midnight. */
export function parseTo(value?: string): Date | undefined {
  if (!value) return undefined;
  if (DATE_ONLY.test(value)) {
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** `YYYY-MM-DD` in UTC — the key format used by the daily stat tables. */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start of the UTC day a key names, and the start of the next one (exclusive). */
export function utcDayBounds(dateKey: string): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
