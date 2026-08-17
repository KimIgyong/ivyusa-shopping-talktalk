import { createHmac } from 'crypto';
import { ksrCanonicalString, ksrHeaders, ksrSignature } from './ksr-signature.util';

/**
 * The signing spec's own worked example (2026-08-14 handoff), plus the two
 * traps it warns about — locked here so a refactor cannot re-introduce them.
 */
describe('ksr-signature.util (PLN-260814 S1)', () => {
  const EMPTY_BODY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const SPEC_EXAMPLE = {
    method: 'GET',
    pathWithQuery: '/api/provider/v1/instance',
    timestamp: 1786455153,
    nonce: 'abc-123',
    body: '',
  };

  it('reproduces the spec example canonical string (empty body hash included)', () => {
    expect(ksrCanonicalString(SPEC_EXAMPLE)).toBe(
      `GET\n/api/provider/v1/instance\n1786455153\nabc-123\n${EMPTY_BODY_SHA}`,
    );
  });

  it('signs as v1= plus exactly 64 lowercase hex chars (trap 2)', () => {
    const sig = ksrSignature('ksrsk_test_secret', SPEC_EXAMPLE);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    // And it is the HMAC of the canonical string, not of anything rebuilt.
    const expected = createHmac('sha256', 'ksrsk_test_secret')
      .update(ksrCanonicalString(SPEC_EXAMPLE))
      .digest('hex');
    expect(sig).toBe(`v1=${expected}`);
  });

  it('signs the path exactly as given — prefix and query order preserved (trap 1)', () => {
    const asSent = ksrSignature('s', { ...SPEC_EXAMPLE, pathWithQuery: '/api/provider/v1/messages?b=2&a=1' });
    const reordered = ksrSignature('s', { ...SPEC_EXAMPLE, pathWithQuery: '/api/provider/v1/messages?a=1&b=2' });
    const noPrefix = ksrSignature('s', { ...SPEC_EXAMPLE, pathWithQuery: '/messages?b=2&a=1' });
    expect(asSent).not.toBe(reordered);
    expect(asSent).not.toBe(noPrefix);
  });

  it('hashes the body into the canonical string', () => {
    const withBody = ksrCanonicalString({ ...SPEC_EXAMPLE, method: 'POST', body: '{"x":1}' });
    expect(withBody).not.toContain(EMPTY_BODY_SHA);
    expect(withBody.startsWith('POST\n')).toBe(true);
  });

  it('mints fresh nonce and a verifiable signature per header set — never reuse on retry', () => {
    const a = ksrHeaders('ksrk_k', 'sec', 'GET', '/api/provider/v1/instance');
    const b = ksrHeaders('ksrk_k', 'sec', 'GET', '/api/provider/v1/instance');
    expect(a['X-KSR-Nonce']).not.toBe(b['X-KSR-Nonce']);
    expect(a['X-KSR-Key-Id']).toBe('ksrk_k');
    expect(Number(a['X-KSR-Timestamp'])).toBeGreaterThan(1_700_000_000);
    // Server-side recomputation with the same parts must match.
    const recomputed = ksrSignature('sec', {
      method: 'GET',
      pathWithQuery: '/api/provider/v1/instance',
      timestamp: Number(a['X-KSR-Timestamp']),
      nonce: a['X-KSR-Nonce'],
      body: '',
    });
    expect(a['X-KSR-Signature']).toBe(recomputed);
  });
});
