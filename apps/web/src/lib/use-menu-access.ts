import { useQuery } from '@tanstack/react-query';
// Type-only: @ivy/types ships CJS whose runtime exports Rollup cannot see.
import type { MenuCode } from '@ivy/types';
import { apiGet } from './api-client';
import { makeCan, type Capability } from './rbac';
import { useAuthStore } from '@/store/auth-store';
import { useTenantKey } from './use-tenant-key';

interface MyMenusResponse {
  menus: MenuCode[];
}

/**
 * Which console menus this user may see, as judged by the server
 * (PLN-260812-Menu-Provisioning-Access S1).
 *
 * Menu visibility used to be computed here in the browser from a copy of the
 * rank × label matrix, which meant the sidebar was the only thing enforcing it.
 * The server now owns the answer so the nav, the route guard and the API gate
 * agree.
 *
 * If that call fails or is still in flight we fall back to the old local
 * calculation rather than rendering an empty sidebar — a console with no
 * navigation is a worse failure than a stale one, and this is exactly the state
 * a user hits on a flaky network.
 */
export function useMenuAccess() {
  const principal = useAuthStore((s) => s.principal);
  const tenantKey = useTenantKey();
  const isTenantUser = principal?.actorType === 'user';

  const { data, isError } = useQuery({
    queryKey: ['menu-access', tenantKey],
    queryFn: () => apiGet<MyMenusResponse>('/menu-access/me'),
    enabled: isTenantUser,
    staleTime: 60_000,
  });

  const can = makeCan(principal);
  const serverMenus = !isError && data ? new Set<string>(data.menus) : null;

  return {
    /** True once the server's answer is in use (false while falling back). */
    fromServer: serverMenus !== null,
    /**
     * `code` is the menu's catalog code; `capability` is the legacy local gate
     * used only while falling back. Items carrying neither (platform-admin nav)
     * are always visible — their gating is the admin actor type itself.
     */
    canSeeMenu: (code?: string, capability?: Capability): boolean => {
      if (serverMenus) return code ? serverMenus.has(code) : true;
      return !capability || can(capability);
    },
  };
}
