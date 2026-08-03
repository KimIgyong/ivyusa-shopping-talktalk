import * as SecureStore from 'expo-secure-store';

// Session token is a long-lived credential — Keychain/Keystore only (R4).
const KEY_SESSION_TOKEN = 'ivy_session_token';
const KEY_LANG_OVERRIDE = 'ivy_lang';
const KEY_ONBOARDED = 'ivy_onboarded';
/**
 * Marketing opt-in chosen during onboarding. notification_prefs writes require a
 * bound customer (anonymous 401s), so the choice is parked here and applied
 * right after the WebView identity bridge upgrades the session (G5).
 */
const KEY_PENDING_MARKETING = 'ivy_pending_marketing_optin';

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_SESSION_TOKEN);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_SESSION_TOKEN, token);
}

export async function getLangOverride(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_LANG_OVERRIDE);
}

export async function setLangOverride(lang: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_LANG_OVERRIDE, lang);
}

export async function isOnboarded(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_ONBOARDED)) === '1';
}

export async function setOnboarded(): Promise<void> {
  await SecureStore.setItemAsync(KEY_ONBOARDED, '1');
}

export async function getPendingMarketingOptIn(): Promise<boolean | null> {
  const v = await SecureStore.getItemAsync(KEY_PENDING_MARKETING);
  return v == null ? null : v === '1';
}

export async function setPendingMarketingOptIn(optIn: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_PENDING_MARKETING, optIn ? '1' : '0');
}

export async function clearPendingMarketingOptIn(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PENDING_MARKETING);
}
