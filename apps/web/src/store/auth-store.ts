import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Principal } from '@/lib/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  principal: Principal | null;
  mustChangePassword: boolean;
  /**
   * MFA-enrollment enforcement (PLN-MFA M3). `mfaEnrollmentRequired` — this
   * rank must enroll (grace banner until `mfaEnforceFrom`); `mfaEnforced` —
   * the date passed, the token is locked to enrollment routes (forced modal).
   */
  mfaEnrollmentRequired: boolean;
  mfaEnforceFrom: string | null;
  mfaEnforced: boolean;
  /**
   * Slug of the tenant login page the user last signed in from (/user/<slug>).
   * Deliberately survives clear() so logout/401 can route back to the right
   * login page — it is a route hint, not a credential.
   */
  tenantSlug: string | null;
  /** Display name of that tenant (sidebar / login header). */
  tenantName: string | null;
  setAuth: (payload: {
    accessToken: string;
    refreshToken: string;
    principal: Principal;
    mustChangePassword: boolean;
    mfaEnrollmentRequired?: boolean;
    mfaEnforceFrom?: string | null;
    mfaEnforced?: boolean;
  }) => void;
  setPrincipal: (principal: Principal) => void;
  setTenant: (slug: string, name?: string | null) => void;
  clearMustChange: () => void;
  clearMfaEnrollment: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      principal: null,
      mustChangePassword: false,
      mfaEnrollmentRequired: false,
      mfaEnforceFrom: null,
      mfaEnforced: false,
      tenantSlug: null,
      tenantName: null,
      setAuth: ({
        accessToken,
        refreshToken,
        principal,
        mustChangePassword,
        mfaEnrollmentRequired,
        mfaEnforceFrom,
        mfaEnforced,
      }) =>
        set({
          accessToken,
          refreshToken,
          principal,
          mustChangePassword,
          mfaEnrollmentRequired: mfaEnrollmentRequired ?? false,
          mfaEnforceFrom: mfaEnforceFrom ?? null,
          mfaEnforced: mfaEnforced ?? false,
        }),
      setPrincipal: (principal) => set({ principal }),
      setTenant: (tenantSlug, tenantName) => set({ tenantSlug, tenantName: tenantName ?? null }),
      clearMustChange: () => set({ mustChangePassword: false }),
      clearMfaEnrollment: () =>
        set({ mfaEnrollmentRequired: false, mfaEnforceFrom: null, mfaEnforced: false }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          principal: null,
          mustChangePassword: false,
          mfaEnrollmentRequired: false,
          mfaEnforceFrom: null,
          mfaEnforced: false,
        }),
    }),
    {
      name: 'ivy_auth',
      // FE-H1: the refresh token stays in memory only — persisting it to
      // localStorage puts a 7-day credential inside any XSS blast radius.
      partialize: (s) => ({
        accessToken: s.accessToken,
        principal: s.principal,
        mustChangePassword: s.mustChangePassword,
        mfaEnrollmentRequired: s.mfaEnrollmentRequired,
        mfaEnforceFrom: s.mfaEnforceFrom,
        mfaEnforced: s.mfaEnforced,
        tenantSlug: s.tenantSlug,
        tenantName: s.tenantName,
      }),
    },
  ),
);
