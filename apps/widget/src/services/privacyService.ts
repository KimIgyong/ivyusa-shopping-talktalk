import { apiClient } from '../lib/api-client';

/** CCPA/CPRA "Do Not Sell or Share" + DSAR consumer-rights endpoints (PRV-M3). */

export function getOptOutStatus(sessionToken: string): Promise<{ optOut: boolean }> {
  return apiClient.get<{ optOut: boolean }>('/privacy/opt-out/status', {
    session_token: sessionToken,
  });
}

export function setOptOut(sessionToken: string, optOut: boolean): Promise<{ optOut: boolean }> {
  return apiClient.post<{ optOut: boolean }>('/privacy/opt-out', {
    session_token: sessionToken,
    opt_out: optOut,
  });
}

/** DSAR access/portability — the full machine-readable export (requires verified identity). */
export function exportMyData(sessionToken: string): Promise<unknown> {
  return apiClient.get<unknown>('/privacy/export', { session_token: sessionToken });
}

/** DSAR erasure — anonymizes the account (requires verified identity). */
export function deleteMyData(sessionToken: string): Promise<{ deleted: boolean }> {
  return apiClient.post<{ deleted: boolean }>('/privacy/delete', {
    session_token: sessionToken,
    confirm: true,
  });
}
