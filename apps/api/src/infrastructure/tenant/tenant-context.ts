import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request-scoped tenant context (AsyncLocalStorage). The TenantContextInterceptor
 * populates `tenantId` per request (from the JWT principal or the widget session),
 * and the TenantSubscriber stamps it onto inserts. Lets services stay tenant-aware
 * without threading tenantId through every call (≈ AMB OwnEntityGuard isolation).
 */
export interface TenantStore {
  tenantId: number | null;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Current request's tenant id, or null when unresolved / outside a request. */
export function currentTenantId(): number | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}
