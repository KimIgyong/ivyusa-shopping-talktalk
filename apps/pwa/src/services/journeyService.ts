import { apiClient, type ListResult } from '../lib/api-client';
import type { JourneyEvent } from '../lib/types';

/** Customer's own CJM timeline (F3, A-7) — session token scoped, paginated. */
export function listJourney(
  sessionToken: string,
  query: { page?: number; size?: number } = {},
): Promise<ListResult<JourneyEvent>> {
  return apiClient.getList<JourneyEvent>('/me/journey', sessionToken, {
    page: query.page,
    size: query.size,
  });
}
