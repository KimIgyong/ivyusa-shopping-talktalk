import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * TOTP (RFC 6238) over HOTP (RFC 4226) — HMAC-SHA1, 30-second step, 6 digits,
 * implemented on Node's built-in crypto (no external dependency, REQ-MFA
 * constraint). Secrets are exchanged base32-encoded (RFC 4648) because that is
 * what authenticator apps expect in `otpauth://` URIs and manual entry.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous/next step too (clock skew tolerance): ±1 step. */
export const TOTP_WINDOW = 1;
/** 20 random bytes (RFC 4226 §4 recommends >= 160-bit secrets) → 32 base32 chars. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 encode, no padding (authenticator apps don't want `=`). */
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** RFC 4648 base32 decode. Case-insensitive; tolerates trailing `=` padding and whitespace. */
export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/\s+/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) {
      throw new Error('invalid base32 character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a fresh TOTP secret: 20 random bytes, base32-encoded (32 chars). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** The RFC 6238 time step for a given instant (T0 = Unix epoch). */
export function timeStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
}

/** The 6-digit code for one specific time step (HOTP dynamic truncation). */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Verify a 6-digit code against the secret within ±`window` steps of `atMs`.
 * Returns the MATCHED step (so callers can enforce the single-use replay guard
 * by persisting it as `last_used_step`), or null when nothing matches.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number = Date.now(),
  window: number = TOTP_WINDOW,
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const base = timeStep(atMs);
  for (let offset = -window; offset <= window; offset++) {
    const step = base + offset;
    if (step < 0) continue;
    const expected = totpCode(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return step;
    }
  }
  return null;
}

/**
 * `otpauth://` provisioning URI (what the console renders as a QR code).
 * Label = account email; the issuer rides both in the path prefix and the
 * `issuer` param, which is what Google Authenticator et al. expect.
 */
export function buildOtpauthUri(issuer: string, label: string, secretBase32: string): string {
  const iss = encodeURIComponent(issuer);
  return (
    `otpauth://totp/${iss}:${encodeURIComponent(label)}` +
    `?secret=${secretBase32}&issuer=${iss}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
  );
}
