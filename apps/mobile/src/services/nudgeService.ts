import { apiClient } from '../lib/api-client';
import type { NudgeCreated } from '../lib/types';

/** 조르기 (A-5) — mints a public gift-hint card; share the returned url via the OS sheet. */
export function createNudge(
  sessionToken: string,
  productHandle: string,
  message?: string,
): Promise<NudgeCreated> {
  return apiClient.post<NudgeCreated>(
    '/nudges',
    { session_token: sessionToken, product_handle: productHandle, message },
    sessionToken,
  );
}
