/**
 * "You're not signed in" is not a failure — it's a state the widget should show a
 * way out of. The API rejects customer-scoped reads (orders, notifications) with
 * 401/403 for an unbound session, so surface those as the sign-in prompt instead
 * of the generic "Something went wrong".
 *
 * `api-client` attaches `status` and the envelope's `code` to the thrown Error.
 */
const AUTH_CODES = new Set([
  'E1001', // UNAUTHORIZED — authentication required
  'E1004', // FORBIDDEN — insufficient permission (e.g. guest asking for verified-only data)
]);

export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; code?: string };
  if (e.status === 401 || e.status === 403) return true;
  return typeof e.code === 'string' && AUTH_CODES.has(e.code);
}
