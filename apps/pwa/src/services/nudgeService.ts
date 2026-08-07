import { apiClient } from '../lib/api-client';
import type { NudgeCard, NudgeCreated } from '../lib/types';

/** 조르기 — nudges (F2, A-5). */

export function createNudge(
  sessionToken: string,
  productHandle: string,
  message?: string,
): Promise<NudgeCreated> {
  return apiClient.post<NudgeCreated>(
    '/nudges',
    {
      session_token: sessionToken,
      product_handle: productHandle,
      ...(message ? { message } : {}),
    },
    sessionToken,
  );
}

/** Public card — recipients open it without the app or a session (no token header). */
export function getNudgeCard(code: string): Promise<NudgeCard> {
  return apiClient.get<NudgeCard>(`/nudges/${encodeURIComponent(code)}`);
}
