/**
 * Query-string date range parsing, shared by the audit, history and statistics
 * endpoints so all three read `from`/`to` identically.
 *
 * Both bounds accept a bare `YYYY-MM-DD` or a full ISO-8601 instant. The upper
 * bound is treated as EXCLUSIVE, and a bare date is widened to the end of that
 * day — otherwise `to=2026-08-04` would silently drop everything that happened
 * on the 4th, which is the day a user picking "through today" actually wants.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an inclusive lower bound. Returns undefined for absent/invalid input. */
export function parseFrom(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Parse an exclusive upper bound, widening a bare date to the next midnight. */
export function parseTo(value?: string): Date | undefined {
  if (!value) return undefined;
  if (DATE_ONLY.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return undefined;
    d.setDate(d.getDate() + 1);
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** `YYYY-MM-DD` in local time — the key format used by the daily stat tables. */
export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
