import { apiGet, apiPost } from '@/lib/api-client';
import type { LoginResponse, Principal } from '@/lib/types';

export const authService = {
  userLogin: (email: string, password: string) =>
    apiPost<LoginResponse>('/auth/user/login', { email, password }),
  adminLogin: (email: string, password: string) =>
    apiPost<LoginResponse>('/auth/admin/login', { email, password }),
  me: () => apiGet<Principal>('/auth/me'),
  // Returns a fresh token pair — the pre-change access token is locked to the
  // change-password flow server-side, so the client must swap immediately.
  changePassword: (current_password: string, new_password: string) =>
    apiPost<LoginResponse>('/auth/change-password', { current_password, new_password }),
  logout: (refresh_token?: string) =>
    apiPost<{ loggedOut: boolean }>('/auth/logout', { refresh_token }),
};
