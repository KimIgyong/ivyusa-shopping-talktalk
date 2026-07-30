import { randomBytes } from 'crypto';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotpSecret,
  timeStep,
  totpCode,
  verifyTotp,
} from './totp.util';

/**
 * RFC 6238 Appendix B test vectors (SHA-1 rows), truncated to 6 digits —
 * the appendix prints 8 digits; the 6-digit code is the last 6 of each.
 */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('totp.util (RFC 6238 / RFC 4226)', () => {
  it('matches the RFC 6238 SHA-1 test vectors (6 digits)', () => {
    for (const [timeSec, expected] of RFC_VECTORS) {
      expect(totpCode(RFC_SECRET, timeStep(timeSec * 1000))).toBe(expected);
    }
  });

  it('verifyTotp accepts each RFC vector at its own instant and returns the matched step', () => {
    for (const [timeSec, code] of RFC_VECTORS) {
      expect(verifyTotp(RFC_SECRET, code, timeSec * 1000)).toBe(timeStep(timeSec * 1000));
    }
  });

  it('accepts codes from the previous and next step (±1 window) but not ±2', () => {
    const atMs = 1111111111 * 1000;
    const base = timeStep(atMs);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, base - 1), atMs)).toBe(base - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, base + 1), atMs)).toBe(base + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, base - 2), atMs)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, base + 2), atMs)).toBeNull();
  });

  it('rejects malformed codes without throwing', () => {
    const atMs = 59 * 1000;
    expect(verifyTotp(RFC_SECRET, '28708', atMs)).toBeNull(); // 5 digits
    expect(verifyTotp(RFC_SECRET, '2870822', atMs)).toBeNull(); // 7 digits
    expect(verifyTotp(RFC_SECRET, '28708a', atMs)).toBeNull(); // non-digit
    expect(verifyTotp(RFC_SECRET, '', atMs)).toBeNull();
  });

  it('base32 roundtrips arbitrary buffers', () => {
    for (const len of [1, 2, 3, 4, 5, 19, 20, 32]) {
      const buf = randomBytes(len);
      expect(base32Decode(base32Encode(buf))).toEqual(buf);
    }
  });

  it('base32Decode tolerates lowercase and padding, rejects invalid characters', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii');
    const encoded = base32Encode(buf);
    expect(base32Decode(encoded.toLowerCase())).toEqual(buf);
    expect(base32Decode(`${encoded}======`)).toEqual(buf);
    expect(() => base32Decode('ABC1DEF')).toThrow(); // '1' is not in the RFC 4648 alphabet
  });

  it('generates unique 32-char base32 secrets decoding to 20 bytes', () => {
    const secrets = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const s = generateTotpSecret();
      expect(s).toMatch(/^[A-Z2-7]{32}$/);
      expect(base32Decode(s).length).toBe(20);
      secrets.add(s);
    }
    expect(secrets.size).toBe(100);
  });

  it('builds an otpauth URI with issuer, encoded label, and TOTP params', () => {
    const uri = buildOtpauthUri('ShopTalk', 'dev@amoeba.group', RFC_SECRET);
    expect(uri).toBe(
      `otpauth://totp/ShopTalk:dev%40amoeba.group?secret=${RFC_SECRET}&issuer=ShopTalk&algorithm=SHA1&digits=6&period=30`,
    );
  });
});
