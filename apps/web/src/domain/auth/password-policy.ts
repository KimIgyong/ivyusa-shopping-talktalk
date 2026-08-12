import { PASSWORD_BLOCKLIST } from './password-blocklist';

/**
 * Client-side mirror of the server password policy's CONTEXT-FREE rules
 * (Stage 3 — POL-018) for instant per-rule form feedback. The server enforces
 * the full policy (incl. identity/reuse rules) and answers E1009 on violation;
 * this mirror only improves UX. Source of truth:
 * apps/api/src/global/util/password-policy.util.ts
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MIN_CHAR_CLASSES = 3;

/** Error code the API returns when a new password violates the policy. */
export const PASSWORD_POLICY_ERROR_CODE = 'E1009';

export type ClientPasswordRule = 'min_length' | 'char_classes' | 'common_password';

const BLOCKSET: ReadonlySet<string> = new Set(PASSWORD_BLOCKLIST.map((e) => e.toLowerCase()));

function countCharClasses(password: string): number {
  let lower = 0;
  let upper = 0;
  let digit = 0;
  let special = 0;
  for (const ch of password) {
    if (ch >= 'a' && ch <= 'z') lower = 1;
    else if (ch >= 'A' && ch <= 'Z') upper = 1;
    else if (ch >= '0' && ch <= '9') digit = 1;
    else special = 1;
  }
  return lower + upper + digit + special;
}

export interface ClientPasswordPolicyResult {
  ok: boolean;
  /** Per-rule pass map for live hint rendering. */
  rules: Record<ClientPasswordRule, boolean>;
}

export function validatePasswordClient(password: string): ClientPasswordPolicyResult {
  const pw = password ?? '';
  const lower = pw.toLowerCase();
  // Alpha core: lowercase minus digits/specials — "Password123!" -> "password".
  const alphaCore = lower.replace(/[^a-z]/g, '');
  const rules: Record<ClientPasswordRule, boolean> = {
    min_length: pw.length >= PASSWORD_MIN_LENGTH,
    char_classes: countCharClasses(pw) >= PASSWORD_MIN_CHAR_CLASSES,
    common_password: !(BLOCKSET.has(lower) || (alphaCore.length > 0 && BLOCKSET.has(alphaCore))),
  };
  return { ok: rules.min_length && rules.char_classes && rules.common_password, rules };
}
