import { apiGet, apiPost } from '@/lib/api-client';
import type {
  LoginResponse,
  LoginResult,
  MfaEnrollment,
  MfaStatus,
  Principal,
  PublicTenant,
} from '@/lib/types';

/** E1011 — invalid, expired or already-used MFA/recovery code. */
export const MFA_CODE_INVALID_ERROR_CODE = 'E1011';
/** E1012 — MFA is already enrolled for this account. */
export const MFA_ALREADY_ENROLLED_ERROR_CODE = 'E1012';

export const authService = {
  // MFA-enabled accounts get `{ mfaRequired: true, mfaToken }` instead of tokens.
  userLogin: (email: string, password: string, tenantSlug: string) =>
    apiPost<LoginResult>('/auth/user/login', { email, password, tenant_slug: tenantSlug }),
  adminLogin: (email: string, password: string) =>
    apiPost<LoginResult>('/auth/admin/login', { email, password }),
  // Public: resolves the /<slug> login page (404 when the tenant does not exist).
  publicTenant: (slug: string) => apiGet<PublicTenant>(`/tenants/by-slug/${encodeURIComponent(slug)}`),
  me: () => apiGet<Principal>('/auth/me'),
  // Returns a fresh token pair — the pre-change access token is locked to the
  // change-password flow server-side, so the client must swap immediately.
  changePassword: (current_password: string, new_password: string) =>
    apiPost<LoginResponse>('/auth/change-password', { current_password, new_password }),
  logout: (refresh_token?: string) =>
    apiPost<{ loggedOut: boolean }>('/auth/logout', { refresh_token }),
  // ---- MFA (TOTP) ----
  // `code` is a 6-digit TOTP or an xxxxx-xxxxx recovery code. 401 = mfaToken
  // expired (send the user back to the password step).
  mfaVerify: (mfa_token: string, code: string) =>
    apiPost<LoginResponse>('/auth/mfa/verify', { mfa_token, code }),
  mfaStatus: () => apiGet<MfaStatus>('/auth/mfa/status'),
  mfaEnroll: () => apiPost<MfaEnrollment>('/auth/mfa/enroll', {}),
  // Confirms the authenticator setup; the 10 recovery codes are shown ONCE.
  mfaEnrollVerify: (code: string) =>
    // tokens: fresh pair issued on activation so a mfaPending-locked client
    // can immediately resume normal API access (PLN-MFA M3).
    apiPost<{ recoveryCodes: string[]; tokens?: LoginResponse }>('/auth/mfa/enroll/verify', {
      code,
    }),
  mfaDisable: (password: string, code: string) =>
    apiPost<{ disabled: boolean }>('/auth/mfa/disable', { password, code }),
};
