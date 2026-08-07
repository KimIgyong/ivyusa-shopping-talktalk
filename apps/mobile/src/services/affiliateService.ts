import { apiClient } from '../lib/api-client';
import type { AffiliateStatus } from '../lib/types';

/**
 * Affiliate share status (A-6) — approved customers get their link_code appended
 * as ?ref= on promoted URLs. 404 = never applied (callers treat as not-affiliate).
 */
export function getAffiliateStatus(sessionToken: string): Promise<AffiliateStatus> {
  return apiClient.get<AffiliateStatus>('/affiliate/status', sessionToken);
}
