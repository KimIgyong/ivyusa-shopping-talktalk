import {
  InvalidServiceAccountError,
  SECRET_MAX_PLAINTEXT,
  deserializeServiceAccount,
  parseServiceAccount,
  serializeServiceAccount,
} from './gdrive-credential.util';

const PEM = ['-----BEGIN PRIVATE KEY-----', 'MIIEvQIBADANBgkqh', '-----END PRIVATE KEY-----', ''].join(
  '\n',
);

const key = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'service_account',
    project_id: 'shoptalk-kb',
    private_key_id: 'abc123',
    private_key: PEM,
    client_email: 'shoptalk-kb@shoptalk-kb.iam.gserviceaccount.com',
    client_id: '1234567890',
    token_uri: 'https://oauth2.googleapis.com/token',
    ...over,
  });

describe('parseServiceAccount', () => {
  it('keeps only the two fields signing needs', () => {
    const sa = parseServiceAccount(key());
    expect(sa).toEqual({
      clientEmail: 'shoptalk-kb@shoptalk-kb.iam.gserviceaccount.com',
      privateKey: PEM,
    });
    // Nothing else from the pasted file is retained — a secret store should not
    // hold what it never reads.
    expect(Object.keys(sa)).toEqual(['clientEmail', 'privateKey']);
  });

  it('repairs a key whose newlines arrived escaped', () => {
    // Pasting through a form field routinely turns newlines into literal \n,
    // which fails at signing time with an opaque OpenSSL error.
    const sa = parseServiceAccount(key({ private_key: PEM.replace(/\n/g, '\\n') }));
    expect(sa.privateKey).toBe(PEM);
  });

  it('names the reason instead of a bare "invalid"', () => {
    expect(() => parseServiceAccount('not json')).toThrow(/not valid JSON/);
    expect(() => parseServiceAccount(key({ client_email: '' }))).toThrow(/client_email is missing/);
    expect(() => parseServiceAccount(key({ private_key: '' }))).toThrow(/private_key is missing/);
    expect(() => parseServiceAccount(key({ private_key: 'hunter2' }))).toThrow(/not a PEM block/);
  });

  it('catches an OAuth client secret pasted by mistake', () => {
    // The likeliest wrong paste, and plausible enough to waste an afternoon.
    expect(() => parseServiceAccount(JSON.stringify({ type: 'authorized_user', client_email: 'a@b.c' })))
      .toThrow(/expected a service account key, got "authorized_user"/);
  });

  it('refuses a key too large for the column', () => {
    // The column is the real constraint; discovering it at INSERT time means a
    // 500 with a truncation error nobody can act on.
    const huge = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(SECRET_MAX_PLAINTEXT)}\n-----END PRIVATE KEY-----`;
    expect(() => parseServiceAccount(key({ private_key: huge }))).toThrow(/too large/);
  });

  it('round-trips through storage', () => {
    const sa = parseServiceAccount(key());
    expect(deserializeServiceAccount(serializeServiceAccount(sa))).toEqual(sa);
  });

  it('rejects a stored value missing a half', () => {
    expect(() => deserializeServiceAccount(JSON.stringify({ clientEmail: 'a@b.c' }))).toThrow(
      InvalidServiceAccountError,
    );
  });

  it('stores a realistic key well inside the column', () => {
    // Sized against a real RSA-2048 service-account key rather than a guess —
    // the previous time a column was sized from an average (external_key
    // VARCHAR(128)), real data was rejected.
    const realistic = `-----BEGIN PRIVATE KEY-----\n${'B'.repeat(1624)}\n-----END PRIVATE KEY-----\n`;
    const stored = serializeServiceAccount(parseServiceAccount(key({ private_key: realistic })));
    expect(Buffer.byteLength(stored)).toBeLessThan(SECRET_MAX_PLAINTEXT);
  });
});
