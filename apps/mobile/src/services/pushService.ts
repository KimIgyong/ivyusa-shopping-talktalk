import { apiClient } from '../lib/api-client';

export interface DeviceTokenResponse {
  id: string;
  platform: string;
  provider: string;
  token: string;
  active: boolean;
}

export function registerPushToken(
  sessionToken: string,
  token: string,
  platform: 'ios' | 'android',
  locale: string,
  appVersion?: string,
): Promise<DeviceTokenResponse> {
  return apiClient.post<DeviceTokenResponse>(
    '/push/register',
    { token, platform, locale, app_version: appVersion },
    sessionToken,
  );
}

export function unregisterPushToken(sessionToken: string, token: string): Promise<unknown> {
  return apiClient.post('/push/unregister', { token }, sessionToken);
}
