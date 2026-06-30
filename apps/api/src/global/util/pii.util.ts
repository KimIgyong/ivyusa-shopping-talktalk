/**
 * PII masking for logs, audit targets, and excerpts (POL / GDPR compliance).
 * Mirrors the `maskEmail` idea from `@ivy/common`: keep a short head, mask the rest.
 */

/**
 * Mask a value for safe logging/audit. Emails keep the first 2 chars of the local
 * part and the domain; generic strings keep the first 2 chars + `***`.
 * Empty/nullish values collapse to `***`.
 */
export function maskPii(value: string | null | undefined): string {
  if (!value) return '***';
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    if (!domain) return '***';
    const head = local.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }
  return `${value.slice(0, 2)}***`;
}
