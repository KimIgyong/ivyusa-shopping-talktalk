import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_MFA_KEY = 'allowPendingMfa';

/**
 * Exempts a route from the MFA-enrollment lockout (PLN-MFA Stage M3). Once the
 * enforcement date (MFA_ENFORCE_FROM) has passed, a required-rank account
 * without MFA gets tokens carrying `mfaPending` and can only reach the routes
 * needed to complete enrollment (mfa/status, mfa/enroll, mfa/enroll/verify,
 * logout) — everything else is E1010 until MFA is active.
 */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA_KEY, true);
