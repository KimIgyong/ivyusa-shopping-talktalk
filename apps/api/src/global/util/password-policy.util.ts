import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { generateCode } from '@ivy/common';
import {
  PASSWORD_IDENTITY_MIN_LENGTH,
  PASSWORD_MIN_CHAR_CLASSES,
  PASSWORD_MIN_LENGTH,
} from '../constant/security.constant';
import { PASSWORD_BLOCKLIST } from '../constant/password-blocklist.constant';

/**
 * Password policy (Stage 3 — POL-018 hardening). Single source of truth for
 * every place a NEW password is accepted: change-password, accept-invite and
 * the temp-password generator. Login validation is deliberately untouched —
 * existing passwords are grandfathered until their next change.
 *
 * Rule keys are stable API surface: they ride in the E1009 BusinessException
 * `details.password` array (and the @IsStrongPassword message) so clients can
 * localize per-rule.
 */
export const PASSWORD_RULE = {
  /** Shorter than PASSWORD_MIN_LENGTH (10). */
  MIN_LENGTH: 'min_length',
  /** Fewer than PASSWORD_MIN_CHAR_CLASSES (3) of lower/upper/digit/special. */
  CHAR_CLASSES: 'char_classes',
  /** Full lowercase form OR its alphabetic core is on the common-password blocklist. */
  COMMON_PASSWORD: 'common_password',
  /** Contains the account email local-part or a name fragment (>= 4 chars). */
  CONTAINS_IDENTITY: 'contains_identity',
  /** Identical to the current password (only checked when the plain is provided). */
  SAME_AS_CURRENT: 'same_as_current',
} as const;

export type PasswordRuleKey = (typeof PASSWORD_RULE)[keyof typeof PASSWORD_RULE];

export interface PasswordPolicyContext {
  email?: string | null;
  name?: string | null;
  currentPasswordPlain?: string | null;
}

export interface PasswordPolicyResult {
  ok: boolean;
  failed: PasswordRuleKey[];
}

const BLOCKSET: ReadonlySet<string> = new Set(PASSWORD_BLOCKLIST.map((e) => e.toLowerCase()));

/**
 * Count character classes: lowercase [a-z], uppercase [A-Z], digit [0-9], and
 * "special" = anything else (symbols, spaces and non-ASCII letters all count
 * as the special class — a unicode passphrase is not penalized).
 */
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

/** Lowercased identity fragments (>= PASSWORD_IDENTITY_MIN_LENGTH) to reject. */
function identityFragments(ctx?: PasswordPolicyContext): string[] {
  const fragments = new Set<string>();
  const add = (raw: string | null | undefined): void => {
    const value = (raw ?? '').trim().toLowerCase();
    if (value.length >= PASSWORD_IDENTITY_MIN_LENGTH) fragments.add(value);
  };
  if (ctx?.email) {
    const local = ctx.email.split('@')[0] ?? '';
    add(local);
    for (const token of local.split(/[._+\-]+/)) add(token);
  }
  if (ctx?.name) {
    add(ctx.name);
    add(ctx.name.replace(/\s+/g, ''));
    for (const token of ctx.name.split(/\s+/)) add(token);
  }
  return [...fragments];
}

/**
 * Validate a candidate NEW password. Context-free rules (min_length,
 * char_classes, common_password) always run; contains_identity /
 * same_as_current only when the corresponding ctx fields are provided.
 * Returns every failed rule key (not just the first).
 */
export function validatePassword(
  password: string,
  ctx?: PasswordPolicyContext,
): PasswordPolicyResult {
  const pw = password ?? '';
  const failed: PasswordRuleKey[] = [];

  if (pw.length < PASSWORD_MIN_LENGTH) failed.push(PASSWORD_RULE.MIN_LENGTH);
  if (countCharClasses(pw) < PASSWORD_MIN_CHAR_CLASSES) failed.push(PASSWORD_RULE.CHAR_CLASSES);

  const lower = pw.toLowerCase();
  // Also match the "alphabetic core" so digit/symbol-decorated variants of a
  // common password ("Password123!" -> "password") are rejected.
  const alphaCore = lower.replace(/[^a-z]/g, '');
  if (BLOCKSET.has(lower) || (alphaCore.length > 0 && BLOCKSET.has(alphaCore))) {
    failed.push(PASSWORD_RULE.COMMON_PASSWORD);
  }

  if (identityFragments(ctx).some((fragment) => lower.includes(fragment))) {
    failed.push(PASSWORD_RULE.CONTAINS_IDENTITY);
  }

  if (ctx?.currentPasswordPlain != null && pw === ctx.currentPasswordPlain) {
    failed.push(PASSWORD_RULE.SAME_AS_CURRENT);
  }

  return { ok: failed.length === 0, failed };
}

/**
 * class-validator decorator enforcing the CONTEXT-FREE rules (length, classes,
 * common list) at the DTO edge. The services re-validate with full identity
 * context (DTO-bypass defense) and throw E1009 there.
 */
export function IsStrongPassword(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && validatePassword(value).ok;
        },
        defaultMessage(args?: ValidationArguments): string {
          const value = args?.value;
          const failed =
            typeof value === 'string'
              ? validatePassword(value).failed
              : [PASSWORD_RULE.MIN_LENGTH];
          return `${args?.property ?? 'password'} does not meet the password policy: ${failed.join(', ')}`;
        },
      },
    });
  };
}

/**
 * Readable one-time temp password that always satisfies the policy, e.g.
 * "IvyK7Q2MA3B9X!" — >= 13 chars with upper+lower+special guaranteed (and the
 * loop re-rolls the astronomically unlikely blocklist/class miss).
 */
export function generateTempPassword(): string {
  // Bounded loop only to guarantee termination for static analysis; a policy
  // pass on the first roll is the overwhelmingly common case.
  for (let i = 0; i < 100; i += 1) {
    const candidate = `Ivy${generateCode(9)}!`;
    if (validatePassword(candidate).ok) return candidate;
  }
  /* istanbul ignore next -- unreachable in practice */
  throw new Error('temp password generation failed');
}
