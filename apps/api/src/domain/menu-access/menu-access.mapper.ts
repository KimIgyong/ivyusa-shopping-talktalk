import { MENU_CATALOG, MENU_PROVISION_MODE, MenuCode, MenuProvisionMode } from '@ivy/types';

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

export class MenuAccessMapper {
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
