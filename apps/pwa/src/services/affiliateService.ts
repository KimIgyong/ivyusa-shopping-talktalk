import { ApiError, apiClient } from '../lib/api-client';
import type { AffiliateStatus } from '../lib/types';

/**
 * Affiliate status for the share sheet (F2, A-6) — approved customers get
 * `?ref={linkCode}` appended to shared product links. 404 (never applied) and
 * 401 (guest session) both mean "not an affiliate", not an error.
 */
export async function getAffiliateStatus(sessionToken: string): Promise<AffiliateStatus | null> {
  try {
    return await apiClient.get<AffiliateStatus>('/affiliate/status', sessionToken);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
    throw e;
  }
}
