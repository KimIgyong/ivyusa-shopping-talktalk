import { apiClient } from '../lib/api-client';
import { SHOP_DOMAIN } from '../lib/config';
import type { SessionResponse } from '../lib/types';

export function ensureSession(
  sessionToken: string | null,
  locale: string,
): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>('/session/ensure', {
    session_token: sessionToken ?? undefined,
    locale,
    shop_domain: SHOP_DOMAIN,
  });
}

export function setConsent(sessionToken: string, granted: boolean): Promise<unknown> {
  return apiClient.post('/session/consent', { session_token: sessionToken, granted });
}

/** `language` is an uppercase code, e.g. 'EN'. */
export function setSessionLanguage(sessionToken: string, language: string): Promise<unknown> {
  return apiClient.post('/session/language', { session_token: sessionToken, language });
}
