import { useAuthStore } from '@/store/auth-store';

/**
 * Returns the tenant key segment for multi-tenant React Query keys
 * (per amoeba_code_convention). Tenant users key on their `tenantId`;
 * system admins (actorType 'admin') have no tenantId, so they key on
 * `'platform'` to keep admin and tenant caches from colliding.
 */
export function useTenantKey(): string {
  return useAuthStore((s) => s.principal?.tenantId ?? 'platform');
}
