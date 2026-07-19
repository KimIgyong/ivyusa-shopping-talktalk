import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/**
 * Exempts a route from the must-change-password lockout (SEC-M2). Only the
 * endpoints a user needs to complete the forced change (change-password, me,
 * logout) should carry this — everything else is blocked until the seeded /
 * temporary password is replaced.
 */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
