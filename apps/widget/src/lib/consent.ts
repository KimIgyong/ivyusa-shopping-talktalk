/**
 * Local cache of the visitor's CCPA consent choice. The server session is the
 * source of truth (session/ensure returns consentState + noticeOutdated); this
 * cache only smooths over offline starts before the first ensure completes.
 */
export const CONSENT_KEY = 'ivy_consent';

export type StoredConsent = 'granted' | 'denied' | null;

export function getStoredConsent(): StoredConsent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : null;
  } catch {
    return null;
  }
}

export function setStoredConsent(granted: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    /* ignore storage failures */
  }
}

export function clearStoredConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore storage failures */
  }
}
