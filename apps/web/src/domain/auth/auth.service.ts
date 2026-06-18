import { apiGet, apiPost } from '@/lib/api-client';
import type { LoginResponse, Principal } from '@/lib/types';

export const authService = {
  userLogin: (email: string, password: string) =>
    apiPost<LoginResponse>('/auth/user/login', { email, password }),
  adminLogin: (email: string, password: string) =>
    apiPost<LoginResponse>('/auth/admin/login', { email, password }),
  me: () => apiGet<Principal>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    apiPost<{ ok: true }>('/auth/change-password', { current_password, new_password }),
};
