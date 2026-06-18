import { randomBytes } from 'crypto';

/** Generate an opaque url-safe token (session tokens, invitation tokens, affiliate links). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short human-friendly code (affiliate link_code). */
export function generateCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[buf[i] % alphabet.length];
  return out;
}

/** Mask PII for logs/excerpts (moderation_logs, audit). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export function truncate(text: string, max = 512): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
