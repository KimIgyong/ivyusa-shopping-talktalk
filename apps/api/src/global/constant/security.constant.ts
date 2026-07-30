/** Security constants (amoeba_privacy_compliance_v2 / code_convention — no magic values). */

/** bcrypt cost factor for password hashing. Convention requires >= 12. */
export const BCRYPT_ROUNDS = 12;

// ---- MFA (PLN-MFA Stage M1) ----

/** Lifetime of the purpose-limited step-up token issued between password and TOTP. */
export const MFA_STEP_UP_TTL_SEC = 300;

/** Recovery codes issued per enrollment (shown once, bcrypt-hashed at rest). */
export const MFA_RECOVERY_CODE_COUNT = 10;

// ---- Password policy (Stage 3 — POL-018 hardening) ----
// Applies to NEW passwords (change-password, accept-invite, temp issuance).
// Existing passwords are grandfathered until their next change; login is untouched.

/** Minimum length for newly set passwords. */
export const PASSWORD_MIN_LENGTH = 12;

/** Minimum distinct character classes (of lowercase/uppercase/digit/special). */
export const PASSWORD_MIN_CHAR_CLASSES = 3;

/**
 * Minimum length of an identity fragment (email local-part / name token) that,
 * when contained in a new password, fails the `contains_identity` rule.
 */
export const PASSWORD_IDENTITY_MIN_LENGTH = 4;
