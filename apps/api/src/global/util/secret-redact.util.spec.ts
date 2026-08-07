import { redactSecrets } from './secret-redact.util';

describe('redactSecrets', () => {
  it('removes the exact key a provider quoted back at us', () => {
    // The staging case: OpenAI echoes the rejected key in its 401 body.
    const body = '{"message":"Incorrect API key provided: amb2026!@. You can find..."}';

    const out = redactSecrets(body, 'amb2026!@');

    expect(out).not.toContain('amb2026!@');
    expect(out).toContain('***redacted***');
    expect(out).toContain('Incorrect API key provided');
  });

  it('catches key-shaped tokens we never held', () => {
    const out = redactSecrets('rejected sk-proj-AbCdEf012345 for org', undefined);

    expect(out).not.toContain('sk-proj-AbCdEf012345');
    expect(out).toContain('for org');
  });

  it('redacts bearer tokens regardless of case', () => {
    expect(redactSecrets('authorization: bearer abcdef0123456789')).not.toContain('abcdef0123456789');
  });

  it('replaces every occurrence, not just the first', () => {
    const out = redactSecrets('key=topsecret1 retry with topsecret1', 'topsecret1');

    expect(out).not.toContain('topsecret1');
    expect(out.match(/\*\*\*redacted\*\*\*/g)).toHaveLength(2);
  });

  it('leaves the message intact when nothing sensitive is present', () => {
    const body = '{"message":"The model `gpt-nope` does not exist"}';

    expect(redactSecrets(body, 'sk-realkey')).toBe(body);
  });

  it('ignores short or empty secrets that would mangle ordinary text', () => {
    // A 3-char "secret" appears inside common words; blanket replacement would
    // destroy the diagnostic value of the log line.
    expect(redactSecrets('the model does not exist', 'the')).toBe('the model does not exist');
    expect(redactSecrets('unchanged', '', null, undefined)).toBe('unchanged');
  });
});
