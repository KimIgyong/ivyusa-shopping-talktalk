import { apiGet, apiPatch } from '@/lib/api-client';

/** Tenant-facing consent notice configuration (camelCase response). */
export interface PrivacyNoticeSettings {
  privacyPolicyUrl: string | null;
  consentNoticeVersion: string | null;
}

/** PATCH body is snake_case per API convention. */
export interface UpdatePrivacyNoticeBody {
  privacy_policy_url?: string | null;
  consent_notice_version?: string;
}

export const privacyNoticeService = {
  get: () => apiGet<PrivacyNoticeSettings>('/tenants/privacy-notice'),
  update: (body: UpdatePrivacyNoticeBody) =>
    apiPatch<PrivacyNoticeSettings>('/tenants/privacy-notice', body),
};
