import { apiClient } from '../lib/api-client';

// NOTE: /privacy/export and /privacy/delete are deliberately NOT exposed here —
// DSAR requires a verified identity, unavailable on the PWA (REQ-PWA C4 / W-6).

export function setOptOut(sessionToken: string, optOut: boolean): Promise<unknown> {
  return apiClient.post('/privacy/opt-out', { session_token: sessionToken, opt_out: optOut });
}

export function getOptOutStatus(sessionToken: string): Promise<{ optOut: boolean }> {
  return apiClient.get<{ optOut: boolean }>('/privacy/opt-out/status', sessionToken);
}
