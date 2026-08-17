import { TEST_FAILURE_REASON, TestFailureReason, TestResult } from './messenger-adapter';

/**
 * Adapter failures, classified.
 *
 * Every adapter's `test()` used to hand the console one flat string, so the
 * console called all of them "connection failed". On staging that turned a
 * relay saying 401 — server up, wrong operator account — into two days of
 * looking at the network (FIX-260813). An adapter that knows which case it hit
 * throws `AdapterFailure`; the rest are classified from their message, and
 * anything unrecognized stays unclassified rather than guessed at.
 */
export class AdapterFailure extends Error {
  constructor(
    readonly reason: TestFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'AdapterFailure';
  }
}

/**
 * The credential exchange failed. Wording is deliberate: 401 names the account,
 * 404 names the URL. Both carry the endpoint, since neither is fixable blind.
 *
 * `provider` is the operator-facing name of the far side ('btbz relay'), which
 * is also the name of the account they must use — the confusion that caused
 * this was a ShopTalk console login typed into a relay's account field.
 */
export function loginFailure(provider: string, status: number | null, url: string): AdapterFailure {
  if (status === 401 || status === 403) {
    return new AdapterFailure(
      TEST_FAILURE_REASON.CREDENTIALS,
      `${provider} rejected the account: ${status} at ${url} — wrong email or password; ` +
        `use the ${provider} operator account, not the ShopTalk console login`,
    );
  }
  if (status === 404) {
    return new AdapterFailure(
      TEST_FAILURE_REASON.NOT_FOUND,
      `${provider} login endpoint not found: 404 at ${url} — check the server URL`,
    );
  }
  if (status !== null && status >= 500) {
    return new AdapterFailure(
      TEST_FAILURE_REASON.PROVIDER_ERROR,
      `${provider} server error on login: ${status} at ${url}`,
    );
  }
  return new AdapterFailure(
    TEST_FAILURE_REASON.PROVIDER_ERROR,
    `${provider} login failed: ${status ?? 'no response'} at ${url}`,
  );
}

/** The provider was never reached — DNS, TLS, refused connection, timeout. */
export function unreachableFailure(provider: string, baseUrl: string, cause: unknown): AdapterFailure {
  const detail = cause instanceof Error ? cause.message : String(cause ?? '');
  return new AdapterFailure(
    TEST_FAILURE_REASON.UNREACHABLE,
    `${provider} could not be reached at ${baseUrl}: ${detail}`.trim(),
  );
}

/** HTTP status carried by an adapter's own `... failed: <status>` message. */
export function httpStatusOf(e: unknown): number | null {
  const message = e instanceof Error ? e.message : String(e ?? '');
  const match = /\b(?:failed|rejected|error)\W{0,3}(\d{3})\b/i.exec(message);
  const status = match ? Number(match[1]) : NaN;
  return Number.isFinite(status) && status >= 100 && status < 600 ? status : null;
}

/**
 * Best-effort classification of an error an adapter did not label itself.
 * Returns undefined when nothing in the message is conclusive — an unset reason
 * shows today's generic copy, which is honest; a wrong one sends the operator
 * to the wrong place, which is the bug being fixed.
 */
export function failureReason(e: unknown): TestFailureReason | undefined {
  if (e instanceof AdapterFailure) return e.reason;
  const message = e instanceof Error ? e.message : String(e ?? '');

  // IMAP/SMTP say it in words rather than a status code.
  if (/AUTHENTICATIONFAILED|invalid credentials|authentication failed|invalid login/i.test(message)) {
    return TEST_FAILURE_REASON.CREDENTIALS;
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|getaddrinfo|socket hang up/i.test(message)) {
    return TEST_FAILURE_REASON.UNREACHABLE;
  }

  const status = httpStatusOf(e);
  if (status === 401 || status === 403) return TEST_FAILURE_REASON.CREDENTIALS;
  if (status === 404) return TEST_FAILURE_REASON.NOT_FOUND;
  if (status !== null && status >= 500) return TEST_FAILURE_REASON.PROVIDER_ERROR;
  return undefined;
}

/** The `catch` half of every adapter's `test()`: classified, never throwing. */
export function failedTest(e: unknown, detail?: string): TestResult {
  const message = detail ?? (e instanceof Error ? e.message : String(e ?? ''));
  return { ok: false, detail: message.slice(0, 200), reason: failureReason(e) };
}
