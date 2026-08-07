import { apiClient } from '../lib/api-client';
import type { JourneyEvent } from '../lib/types';

/** 쇼핑 다이어리 타임라인 (A-7) — CJM events for the session's customer. Anonymous sessions get 401. */
export function listJourney(
  sessionToken: string,
  opts: { page?: number; size?: number } = {},
): Promise<JourneyEvent[]> {
  // Paginated endpoint — the envelope unwrap yields the items array (data).
  return apiClient.get<JourneyEvent[]>('/me/journey', sessionToken, {
    page: opts.page,
    size: opts.size,
  });
}
