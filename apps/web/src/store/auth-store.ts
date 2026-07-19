import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Principal } from '@/lib/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  principal: Principal | null;
  mustChangePassword: boolean;
  setAuth: (payload: {
    accessToken: string;
    refreshToken: string;
    principal: Principal;
    mustChangePassword: boolean;
  }) => void;
  setPrincipal: (principal: Principal) => void;
  clearMustChange: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      principal: null,
      mustChangePassword: false,
      setAuth: ({ accessToken, refreshToken, principal, mustChangePassword }) =>
        set({ accessToken, refreshToken, principal, mustChangePassword }),
      setPrincipal: (principal) => set({ principal }),
      clearMustChange: () => set({ mustChangePassword: false }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          principal: null,
          mustChangePassword: false,
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
      }),
    },
  ),
);
