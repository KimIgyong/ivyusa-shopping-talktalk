import { randomBytes } from 'crypto';
import { blindIndex, decryptPii, encryptPii } from './crypto.util';

/** PRV-M6 PII helpers: round-trip, null-safety, legacy tolerance, blind index. */
describe('PII crypto helpers', () => {
  beforeAll(() => {
    process.env.CRED_ENC_KEY = randomBytes(32).toString('base64');
  });

  it('round-trips a value through encrypt/decrypt', () => {
    const enc = encryptPii('shopper@example.com');
    expect(Buffer.isBuffer(enc)).toBe(true);
    expect(enc!.toString('utf8')).not.toContain('shopper'); // not plaintext
    expect(decryptPii(enc)).toBe('shopper@example.com');
  });

  it('treats null/empty as null (both directions)', () => {
    expect(encryptPii(null)).toBeNull();
    expect(encryptPii('')).toBeNull();
    expect(decryptPii(null)).toBeNull();
    expect(decryptPii(Buffer.alloc(0))).toBeNull();
  });

  it('uses a fresh IV each time (ciphertexts differ)', () => {
    expect(encryptPii('same')!.equals(encryptPii('same')!)).toBe(false);
  });

  it('tolerates legacy plaintext bytes (pre-migration rows)', () => {
    // Short plaintext stored as bytes — decryptPii returns it verbatim.
    expect(decryptPii(Buffer.from('12 Main St', 'utf8'))).toBe('12 Main St');
    // Long plaintext (> GCM envelope) that isn't valid ciphertext also survives.
    const longPlain = 'a very long legacy plaintext address value beyond the envelope';
    expect(decryptPii(Buffer.from(longPlain, 'utf8'))).toBe(longPlain);
  });

  it('blindIndex is deterministic and normalizes case + whitespace', () => {
    const a = blindIndex('  Shopper@Example.com ');
    const b = blindIndex('shopper@example.com');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blindIndex differs for different inputs and is null-safe', () => {
    expect(blindIndex('a@x.com')).not.toBe(blindIndex('b@x.com'));
    expect(blindIndex(null)).toBeNull();
    expect(blindIndex('   ')).toBeNull();
  });
});
