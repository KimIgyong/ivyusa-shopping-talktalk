import { Session } from './entity/session.entity';
import { PrivacyNoticeInfo } from './session.service';

/** Entity → camelCase response mapping (static methods, per convention). */
export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: string;
  authenticated: boolean;
  /** Tenant's privacy-policy link (null when the tenant has not set one). */
  privacyPolicyUrl: string | null;
  /** Effective consent-notice version (tenant override ?? platform default). */
  consentNoticeVersion: string;
  /** True when a recorded consent references a version other than the effective one. */
  noticeOutdated: boolean;
  /** When the consent choice was recorded (ISO 8601), null when never recorded. */
  consentAt: string | null;
}

export class SessionMapper {
  static toResponse(s: Session, notice: PrivacyNoticeInfo): SessionResponse {
    return {
      sessionToken: s.sessionToken,
      language: s.language,
      consentState: s.consentState,
      authenticated: s.customerId != null,
      privacyPolicyUrl: notice.privacyPolicyUrl,
      consentNoticeVersion: notice.consentNoticeVersion,
      noticeOutdated: s.consentVersion != null && s.consentVersion !== notice.consentNoticeVersion,
      consentAt: s.consentAt ? new Date(s.consentAt).toISOString() : null,
    };
  }
}
