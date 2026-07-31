import { apiClient } from '../lib/api-client';

export function exportData(sessionToken: string): Promise<Record<string, unknown>> {
  return apiClient.get<Record<string, unknown>>('/privacy/export', sessionToken);
}

export function deleteData(sessionToken: string): Promise<unknown> {
  return apiClient.post('/privacy/delete', { session_token: sessionToken, confirm: true });
}

export function setOptOut(sessionToken: string, optOut: boolean): Promise<unknown> {
  return apiClient.post('/privacy/opt-out', { session_token: sessionToken, opt_out: optOut });
}

export function getOptOutStatus(sessionToken: string): Promise<{ optOut: boolean }> {
  return apiClient.get<{ optOut: boolean }>('/privacy/opt-out/status', sessionToken);
}
