import { apiClient } from '../lib/api-client';

export interface DeviceTokenResponse {
  id: string;
  platform: string;
  provider: string;
  token: string;
  active: boolean;
}

/** VAPID public key for PushManager.subscribe (null when server has no key). */
export function getVapidKey(): Promise<{ publicKey: string | null }> {
  return apiClient.get<{ publicKey: string | null }>('/push/vapid-key');
}

/** `token` is the JSON-stringified PushSubscription (endpoint + p256dh + auth). */
export function registerPushToken(
  sessionToken: string,
  token: string,
  locale: string,
): Promise<DeviceTokenResponse> {
  return apiClient.post<DeviceTokenResponse>(
    '/push/register',
    { token, platform: 'web', provider: 'webpush', locale },
    sessionToken,
  );
}

export function unregisterPushToken(sessionToken: string, token: string): Promise<unknown> {
  return apiClient.post('/push/unregister', { token }, sessionToken);
}
