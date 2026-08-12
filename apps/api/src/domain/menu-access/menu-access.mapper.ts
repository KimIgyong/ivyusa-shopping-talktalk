import {
  MENU_ACCESS_MODE,
  MENU_CATALOG,
  MENU_PROVISION_MODE,
  MenuAccessMode,
  MenuCode,
  MenuProvisionMode,
  UserRank,
} from '@ivy/types';
import { roleAllows, RoleMenuRow } from '@ivy/common';

export interface TenantMenuRow {
  code: MenuCode;
  /** i18n key in the console's `nav` namespace — menu names are already there. */
  labelKey: string;
  path: string;
  /** Whether the tenant's plan includes it before any override. */
  planDefault: boolean;
  mode: MenuProvisionMode;
  /** Result of plan + override, so the console can show it before saving. */
  provided: boolean;
}

export interface TenantMenusView {
  tenantUuid: string;
  tenantName: string | null;
  plan: string | null;
  menus: TenantMenuRow[];
}

/** One catalog row as the tenant console sees it. */
export interface TenantCatalogRow {
  code: MenuCode;
  labelKey: string;
  path: string;
  /** False → the platform does not provision it; the console greys the column. */
  provided: boolean;
  /** Job label the screen needs, so the console can say why a grant did nothing. */
  requiredLabel: string | null;
}

export interface RoleMatrixRow {
  rank: UserRank;
  /** Master is shown read-only: it always holds everything the tenant is provisioned. */
  editable: boolean;
  menus: Record<string, boolean>;
}

export interface RoleMatrixView {
  menus: TenantCatalogRow[];
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
  menus: TenantCatalogRow[];
  users: UserOverrideRow[];
}

export class MenuAccessMapper {
  static toCatalogRows(provided: readonly MenuCode[]): TenantCatalogRow[] {
    const providedSet = new Set(provided);
    return MENU_CATALOG.map((entry) => ({
      code: entry.code,
      labelKey: entry.labelKey,
      path: entry.path,
      provided: providedSet.has(entry.code),
      requiredLabel: entry.requiredLabel ?? null,
    }));
  }

  static toRoleMatrix(params: {
    provided: readonly MenuCode[];
    ranks: readonly UserRank[];
    masterRank: UserRank;
    roleRows: readonly RoleMenuRow[];
  }): RoleMatrixView {
    const providedSet = new Set(params.provided);
    return {
      menus: MenuAccessMapper.toCatalogRows(params.provided),
      ranks: params.ranks.map((rank) => ({
        rank,
        editable: rank !== params.masterRank,
        menus: Object.fromEntries(
          MENU_CATALOG.map((entry) => [
            entry.code,
            rank === params.masterRank
              ? providedSet.has(entry.code)
              : roleAllows(rank, entry.code, params.roleRows),
          ]),
        ),
      })),
    };
  }

  static toUserOverrides(params: {
    provided: readonly MenuCode[];
    users: readonly {
      id: number;
      email: string;
      name: string | null;
      rank: string;
      status: string;
    }[];
    rowsByUser: Map<string, { menuCode: MenuCode; allowed: boolean }[]>;
  }): UserOverridesView {
    return {
      menus: MenuAccessMapper.toCatalogRows(params.provided),
      users: params.users.map((u) => ({
        userId: String(u.id),
        email: u.email,
        name: u.name,
        rank: u.rank,
        status: u.status,
        overrides: Object.fromEntries(
          (params.rowsByUser.get(String(u.id)) ?? []).map((r) => [
            r.menuCode,
            r.allowed ? MENU_ACCESS_MODE.ALLOW : MENU_ACCESS_MODE.DENY,
          ]),
        ),
      })),
    };
  }

  static toTenantMenus(params: {
    tenantUuid: string;
    tenantName: string | null;
    plan: string | null;
    planMenus: readonly MenuCode[];
    overrides: Map<MenuCode, boolean>;
    provided: readonly MenuCode[];
  }): TenantMenusView {
    const planSet = new Set(params.planMenus);
    const providedSet = new Set(params.provided);
    return {
      tenantUuid: params.tenantUuid,
      tenantName: params.tenantName,
      plan: params.plan,
      menus: MENU_CATALOG.map((entry) => {
        const override = params.overrides.get(entry.code);
        return {
          code: entry.code,
          labelKey: entry.labelKey,
          path: entry.path,
          planDefault: planSet.has(entry.code),
          mode:
            override === undefined
              ? MENU_PROVISION_MODE.PLAN
              : override
                ? MENU_PROVISION_MODE.ON
                : MENU_PROVISION_MODE.OFF,
          provided: providedSet.has(entry.code),
        };
      }),
    };
  }
}
