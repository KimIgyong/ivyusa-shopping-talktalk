import { apiGet, apiPut } from '@/lib/api-client';

/** Exception a tenant master can pin against a member's rank default. */
export type MenuAccessMode = 'default' | 'allow' | 'deny';

export interface MenuCatalogRow {
  code: string;
  /** i18n key in the `nav` namespace — menu names are already translated there. */
  labelKey: string;
  path: string;
  /** False → the plan does not provide it; nothing the tenant sets can open it. */
  provided: boolean;
  /** Job label the screen needs, so the UI can explain a grant that did nothing. */
  requiredLabel: string | null;
}

export interface RoleMatrixRow {
  rank: string;
  /** Master is read-only: it always holds everything the tenant is provisioned. */
  editable: boolean;
  menus: Record<string, boolean>;
}

export interface RoleMatrixView {
  menus: MenuCatalogRow[];
  ranks: RoleMatrixRow[];
}

export interface UserOverrideRow {
  userId: string;
  email: string;
  name: string | null;
  rank: string;
  status: string;
  overrides: Record<string, MenuAccessMode>;
}

export interface UserOverridesView {
  menus: MenuCatalogRow[];
  users: UserOverrideRow[];
}

export const menuAccessService = {
  roles: () => apiGet<RoleMatrixView>('/menu-access/roles'),
  saveRoles: (roles: { rank: string; menuCode: string; allowed: boolean }[]) =>
    // Backend DTOs are snake_case.
    apiPut<RoleMatrixView>('/menu-access/roles', {
      roles: roles.map((r) => ({ rank: r.rank, menu_code: r.menuCode, allowed: r.allowed })),
    }),
  users: () => apiGet<UserOverridesView>('/menu-access/users'),
  saveUser: (userId: string, menus: { code: string; mode: MenuAccessMode }[]) =>
    apiPut<UserOverridesView>(`/menu-access/users/${userId}`, {
      menus: menus.map((m) => ({ menu_code: m.code, mode: m.mode })),
    }),
};
