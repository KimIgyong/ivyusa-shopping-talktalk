import { signFileUrl, verifyFileUrl } from './crypto.util';

/**
 * The attachment download route is public — this signature is the whole of its
 * authorisation, so each test here is one way an attacker could otherwise reach
 * a file they were never handed a link to.
 */
describe('signed attachment URLs', () => {
  const KEY = Buffer.alloc(32, 7).toString('base64');
  const uuid = '11111111-2222-3333-4444-555555555555';
  const now = 1_760_000_000_000;
  const exp = Math.floor(now / 1000) + 900;

  beforeEach(() => {
    process.env.CRED_ENC_KEY = KEY;
    delete process.env.FILE_URL_SECRET;
  });

  it('accepts the signature it just produced', () => {
    const sig = signFileUrl(uuid, 'full', exp);
    expect(verifyFileUrl(uuid, 'full', exp, sig, now)).toBe(true);
  });

  it('refuses an expired link even though the signature is genuine', () => {
    const sig = signFileUrl(uuid, 'full', exp);
    expect(verifyFileUrl(uuid, 'full', exp, sig, exp * 1000 + 1)).toBe(false);
  });

  it('refuses a signature moved onto a different file', () => {
    const sig = signFileUrl(uuid, 'full', exp);
    const other = '99999999-2222-3333-4444-555555555555';
    expect(verifyFileUrl(other, 'full', exp, sig, now)).toBe(false);
  });

  it('refuses a variant swap — a thumb link cannot fetch the original', () => {
    const sig = signFileUrl(uuid, 'thumb', exp);
    expect(verifyFileUrl(uuid, 'full', exp, sig, now)).toBe(false);
  });

  it('refuses an extended expiry (the expiry is inside the signature)', () => {
    const sig = signFileUrl(uuid, 'full', exp);
    expect(verifyFileUrl(uuid, 'full', exp + 86_400, sig, now)).toBe(false);
  });

  it('fails closed on a malformed or empty signature', () => {
    expect(verifyFileUrl(uuid, 'full', exp, '', now)).toBe(false);
    expect(verifyFileUrl(uuid, 'full', exp, 'deadbeef', now)).toBe(false);
    expect(verifyFileUrl(uuid, 'full', Number.NaN, signFileUrl(uuid, 'full', exp), now)).toBe(false);
  });

  it('changes with the key, so links do not survive a secret rotation', () => {
    const sig = signFileUrl(uuid, 'full', exp);
    process.env.FILE_URL_SECRET = 'a-different-secret';
    expect(verifyFileUrl(uuid, 'full', exp, sig, now)).toBe(false);
  });
});
