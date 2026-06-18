import { AdminLevel, JobLabel, UserRank } from '@ivy/types';

/** Response DTO — camelCase. */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  principal: PrincipalResponse;
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
