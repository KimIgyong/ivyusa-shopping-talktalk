import {
  AdapterFailure,
  failedTest,
  failureReason,
  httpStatusOf,
  loginFailure,
  unreachableFailure,
} from './adapter-failure.util';
import { TEST_FAILURE_REASON } from './messenger-adapter';

/**
 * FIX-260813. The console called a rejected password "connection failed", so a
 * relay that was up and answering was chased as a network outage. These cases
 * are the ones an operator acts on differently.
 */
describe('adapter failure classification', () => {
  it('calls a 401 a credential failure and says which account to use', () => {
    const failure = loginFailure('btbz relay', 401, 'https://messenger.amoeba.site/api/auth/login');

    expect(failure.reason).toBe(TEST_FAILURE_REASON.CREDENTIALS);
    expect(failure.message).toContain('rejected the account: 401');
    // The actual mistake: a ShopTalk console login typed into the relay's field.
    expect(failure.message).toContain('not the ShopTalk console login');
    // Still names the endpoint — a wrong base URL is the other candidate.
    expect(failure.message).toContain('https://messenger.amoeba.site/api/auth/login');
  });

  it('treats 403 as the same class as 401', () => {
    expect(loginFailure('amoebatalk', 403, 'https://h/api/auth/signin').reason).toBe(
      TEST_FAILURE_REASON.CREDENTIALS,
    );
  });

  it('keeps 404 pointing at the server URL, not the account', () => {
    const failure = loginFailure('btbz relay', 404, 'https://wrong.example/api/auth/login');

    expect(failure.reason).toBe(TEST_FAILURE_REASON.NOT_FOUND);
    expect(failure.message).toContain('check the server URL');
    expect(failure.message).not.toContain('password');
  });

  it('separates the provider being broken from us being wrong', () => {
    expect(loginFailure('btbz relay', 502, 'https://h/api/auth/login').reason).toBe(
      TEST_FAILURE_REASON.PROVIDER_ERROR,
    );
    expect(unreachableFailure('btbz relay', 'https://h', new Error('getaddrinfo ENOTFOUND h')).reason).toBe(
      TEST_FAILURE_REASON.UNREACHABLE,
    );
  });

  it('recovers the status from an adapter message that carries one', () => {
    expect(httpStatusOf(new Error('telegram getMe failed: 401 Unauthorized'))).toBe(401);
    expect(httpStatusOf(new Error('btbz relay GET https://h/api/x failed: 404'))).toBe(404);
    expect(httpStatusOf(new Error('nothing numeric here'))).toBeNull();
    // A conversation id in a message must not be read as a status.
    expect(httpStatusOf(new Error('conversation 404 has no messages'))).toBeNull();
  });

  it('classifies unlabeled adapter errors by status and by wording', () => {
    expect(failureReason(new Error('telegram getMe failed: 401 Unauthorized'))).toBe(
      TEST_FAILURE_REASON.CREDENTIALS,
    );
    expect(failureReason(new Error('gmail: Invalid credentials (Failure)'))).toBe(
      TEST_FAILURE_REASON.CREDENTIALS,
    );
    expect(failureReason(new Error('connect ECONNREFUSED 10.0.0.1:993'))).toBe(
      TEST_FAILURE_REASON.UNREACHABLE,
    );
  });

  it('leaves an unrecognized failure unclassified rather than guessing', () => {
    // A guessed cause sends the operator somewhere wrong — the exact bug here.
    expect(failureReason(new Error('viber /pa/get_account_info failed: 200 invalid token'))).toBeUndefined();
    expect(failedTest(new Error('something odd')).reason).toBeUndefined();
  });

  it('carries an adapter-declared reason through the test result', () => {
    const result = failedTest(new AdapterFailure(TEST_FAILURE_REASON.CREDENTIALS, 'x'.repeat(400)));

    expect(result).toMatchObject({ ok: false, reason: TEST_FAILURE_REASON.CREDENTIALS });
    expect(result.detail).toHaveLength(200); // the column caps at 255
  });
});
