/**
 * Local cache of the visitor's CCPA consent choice. The server session remains
 * the recorder of every choice (one row per session), but embedded anonymous
 * widgets get a NEW session on every page load (privacy: no cross-visitor
 * resume), so without this cache the shopper would be re-asked on every page.
 * The stored record carries the notice version it was given against; on a new
 * session the widget silently re-records ("auto-replay") a matching choice via
 * POST /session/consent instead of showing the banner — a version bump makes
 * the record stale and re-prompts, keeping the re-consent policy (PRV-M4).
 */
export const CONSENT_KEY = 'ivy_consent';

export type StoredConsent = 'granted' | 'denied' | null;

export interface StoredConsentRecord {
  state: 'granted' | 'denied';
  /** Notice version the choice was made against; null = unknown (legacy value). */
  version: string | null;
  /** When the choice was recorded (ISO 8601); null for legacy values. */
  at: string | null;
}

/** Full record, or null when nothing (valid) is stored. */
export function getStoredConsentRecord(): StoredConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    // Legacy plain-string values ('granted'/'denied') predate versioning: keep
    // the state (GA4 bootstrap) but with version null they never auto-replay.
    if (raw === 'granted' || raw === 'denied') return { state: raw, version: null, at: null };
    const parsed = JSON.parse(raw) as Partial<StoredConsentRecord>;
    if (parsed.state !== 'granted' && parsed.state !== 'denied') return null;
    return {
      state: parsed.state,
      version: typeof parsed.version === 'string' ? parsed.version : null,
      at: typeof parsed.at === 'string' ? parsed.at : null,
    };
  } catch {
    return null;
  }
}

/** State-only view — existing call sites (GA4 gate, banner bootstrap). */
export function getStoredConsent(): StoredConsent {
  return getStoredConsentRecord()?.state ?? null;
}

export function setStoredConsent(granted: boolean, version?: string | null): void {
  try {
    const record: StoredConsentRecord = {
      state: granted ? 'granted' : 'denied',
      version: version ?? null,
      at: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
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
