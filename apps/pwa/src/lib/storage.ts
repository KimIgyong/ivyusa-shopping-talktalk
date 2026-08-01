/**
 * localStorage wrappers. The session token lives in localStorage (not a cookie)
 * because the SW push flow and the SPA share it across standalone/tab contexts;
 * accessors are try/catch-guarded for privacy modes that block storage.
 */
const KEY_SESSION_TOKEN = 'ivy_session_token';
const KEY_LANG_OVERRIDE = 'ivy_lang';
const KEY_INSTALL_DISMISSED = 'ivy_install_dismissed';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode / quota) — session becomes per-load.
  }
}

export function getSessionToken(): string | null {
  return safeGet(KEY_SESSION_TOKEN);
}

export function setSessionToken(token: string): void {
  safeSet(KEY_SESSION_TOKEN, token);
}

export function getLangOverride(): string | null {
  return safeGet(KEY_LANG_OVERRIDE);
}

export function setLangOverride(lang: string): void {
  safeSet(KEY_LANG_OVERRIDE, lang);
}

export function isInstallDismissed(): boolean {
  return safeGet(KEY_INSTALL_DISMISSED) === '1';
}

export function setInstallDismissed(): void {
  safeSet(KEY_INSTALL_DISMISSED, '1');
}
