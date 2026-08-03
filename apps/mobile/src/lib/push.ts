import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken } from '../services/pushService';

/**
 * Ask permission (if needed), fetch the Expo push token, and register it with
 * the API bound to the current session. Safe to call repeatedly — the server
 * upserts by token, and re-registration after an identity upgrade rebinds the
 * device to the customer. Returns the token, or null when unavailable
 * (simulator, permission denied, no projectId in a bare `expo start` run).
 */
export async function registerDeviceForPush(
  sessionToken: string,
  locale: string,
): Promise<string | null> {
  if (!Device.isDevice) return null;

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const expoToken = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    await registerPushToken(
      sessionToken,
      expoToken,
      Platform.OS === 'ios' ? 'ios' : 'android',
      locale,
      Constants.expoConfig?.version ?? undefined,
    );
    return expoToken;
  } catch {
    // Push registration must never block app startup — the in-app notification
    // center remains the fallback delivery surface.
    return null;
  }
}

/** Foreground presentation: show banners for pushes arriving while the app is open. */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}
