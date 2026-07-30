import { AdminLevel, JobLabel, UserRank } from '@ivy/types';

/** Response DTO — camelCase. */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  principal: PrincipalResponse;
}

/**
 * Step-up challenge (PLN-MFA Stage M1): returned by the login endpoints instead
 * of tokens when the authenticated account has MFA enabled. The mfaToken is a
 * purpose-limited 5-minute JWT usable only at POST /auth/mfa/verify.
 */
export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
}

export interface PrincipalResponse {
  actorType: 'admin' | 'user';
  id: number;
  email: string;
  tenantId?: number;
  level?: AdminLevel;
  rank?: UserRank;
  labels?: JobLabel[];
}
