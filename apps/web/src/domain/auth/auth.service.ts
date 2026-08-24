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
  // AMA-portal SSO (PLN-260813 S3): the iframe URL carries a short-lived
  // ama_token; the server exchanges + maps it and returns normal tokens
  // (never an MFA challenge — SSO is step-up exempt by decision D4).
  amaSso: (ama_token: string, tenantSlug: string) =>
    apiPost<LoginResponse>('/auth/sso/ama', { ama_token, tenant_slug: tenantSlug }),
  // Public: resolves the /<slug> login page (404 when the tenant does not exist).
  publicTenant: (slug: string) => apiGet<PublicTenant>(`/tenants/by-slug/${encodeURIComponent(slug)}`),
  me: () => apiGet<Principal>('/auth/me'),
  // Returns a fresh token pair — the pre-change access token is locked to the
  // change-password flow server-side, so the client must swap immediately.
  changePassword: (current_password: string, new_password: string) =>
    apiPost<LoginResponse>('/auth/change-password', { current_password, new_password }),
  logout: (refresh_token?: string) =>
    apiPost<{ loggedOut: boolean }>('/auth/logout', { refresh_token }),
  // ---- Self-service password recovery from the login page (PLN-260824) ----
  // Neutral response: `{ requested: true }` whether or not the account exists.
  tempPasswordRequest: (tenantSlug: string, email: string) =>
    apiPost<{ requested: true }>('/auth/password/temp-request', {
      tenant_slug: tenantSlug,
      email,
    }),
  // Works while the login lockout is active; clears it on success.
  passwordChangeSelf: (
    tenantSlug: string,
    email: string,
    current_password: string,
    new_password: string,
  ) =>
    apiPost<{ changed: true }>('/auth/password/change', {
      tenant_slug: tenantSlug,
      email,
      current_password,
      new_password,
    }),
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
