import { apiClient } from '../lib/api-client';
import type { SessionResponse } from '../lib/types';

export function ensureSession(
  sessionToken: string | null,
  locale: string,
): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>('/session/ensure', {
    session_token: sessionToken ?? undefined,
    locale,
  });
}

export function setConsent(
  sessionToken: string,
  granted: boolean,
): Promise<unknown> {
  return apiClient.post('/session/consent', {
    session_token: sessionToken,
    granted,
  });
}
