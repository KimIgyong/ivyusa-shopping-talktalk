import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM credential encryption (POL-018). Stored layout in a single buffer:
 * [12-byte IV][16-byte auth tag][ciphertext]. Key from CRED_ENC_KEY (base64, 32 bytes).
 */
const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const raw = process.env.CRED_ENC_KEY ?? '';
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('CRED_ENC_KEY must be 32 bytes (base64-encoded)');
  }
  return buf;
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decryptSecret(stored: Buffer): string {
  const iv = stored.subarray(0, 12);
  const tag = stored.subarray(12, 28);
  const enc = stored.subarray(28);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
