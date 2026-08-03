import { getVapidKey, registerPushToken } from '../services/pushService';

/**
 * Web Push setup outcomes (drive the PLN-PWA wireframe 3.3 states):
 * - 'ok'               subscribed + registered with the API
 * - 'ios-needs-install' iOS Safari tab — push only works from the installed PWA (C2)
 * - 'no-key'           server has no VAPID key configured
 * - 'denied'           user denied the browser notification permission
 * - 'unsupported'      browser lacks serviceWorker/PushManager/Notification
 * - 'error'            subscribe/register failed unexpectedly
 */
export type PushSetupResult =
  | 'ok'
  | 'ios-needs-install'
  | 'no-key'
  | 'denied'
  | 'unsupported'
  | 'error';

export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari legacy flag for A2HS-launched pages.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Return type intentionally inferred: TS >=5.7 needs Uint8Array<ArrayBuffer>
// for PushSubscriptionOptionsInit, while TS 5.4 has a non-generic Uint8Array.
export function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Full subscription flow. Safe to call repeatedly — the server upserts by
 * token hash, which also covers browser-side subscription rotation.
 * iOS is checked BEFORE any permission prompt (a Safari-tab prompt would be
 * wasted: push never fires outside the installed PWA).
 */
export async function subscribeAndRegister(
  sessionToken: string,
  lang: string,
): Promise<PushSetupResult> {
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!pushSupported()) return 'unsupported';

  let publicKey: string | null;
  try {
    publicKey = (await getVapidKey()).publicKey ?? null;
  } catch {
    return 'no-key';
  }
  if (!publicKey) return 'no-key';

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await registerPushToken(sessionToken, JSON.stringify(subscription.toJSON()), lang);
    return 'ok';
  } catch {
    return 'error';
  }
}
