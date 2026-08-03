import { DeviceToken } from './entity/device-token.entity';

/** Map a device-token row to the camelCase response shape (token echoed back). */
export function toDeviceTokenResponse(t: DeviceToken) {
  return {
    id: t.id,
    platform: t.platform,
    provider: t.provider,
    token: t.token,
    locale: t.locale,
    appVersion: t.appVersion,
    active: t.revokedAt == null,
    createdAt: t.createdAt,
  };
}
