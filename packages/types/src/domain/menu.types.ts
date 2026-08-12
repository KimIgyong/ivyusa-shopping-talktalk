import { JOB_LABEL, JobLabel } from '../common/enum.types';

/**
 * Console menu catalog — PLN-260812-Menu-Provisioning-Access.
 *
 * The tenant console's left nav used to exist only as a hard-coded array in
 * `apps/web/src/layouts/nav-config.ts`, which meant the server had no notion of
 * a "menu" at all: hiding an item was decoration a URL could walk straight past.
 * This catalog is the single source of truth both sides judge against.
 *
 * A menu code is one SCREEN, not one capability. The old nav gated several
 * screens behind a shared capability (`live_chat` covered both live chat and
 * the issue board), so those screens could never be provisioned apart.
 */
export const MENU = {
  DASHBOARD: 'dashboard',
  LIVE_CHAT: 'live_chat',
  ISSUES: 'issues',
  HISTORY: 'history',
  WORK_LOG: 'work_log',
  STATISTICS: 'statistics',
  AI_SETTINGS: 'ai_settings',
  KNOWLEDGE: 'knowledge',
  PRODUCTS: 'products',
  CUSTOMERS: 'customers',
  ORDERS: 'orders',
  CAMPAIGNS: 'campaigns',
  REVIEWS: 'reviews',
  USERS: 'users',
  SETTINGS: 'settings',
  PRIVACY_NOTICE: 'privacy_notice',
} as const;
export type MenuCode = (typeof MENU)[keyof typeof MENU];

export interface MenuCatalogEntry {
  code: MenuCode;
  /** Console route the menu opens. */
  path: string;
  /** i18n key in the web app's `nav` namespace — menu names are already translated there. */
  labelKey: string;
  /**
   * Job label the screen has always required. Kept as a separate axis from the
   * rank matrix so a tenant editing the matrix does not silently widen who can
   * see consult-only or operations-only screens.
   */
  requiredLabel?: JobLabel;
}

export const MENU_CATALOG: readonly MenuCatalogEntry[] = [
  { code: MENU.DASHBOARD, path: '/dashboard', labelKey: 'dashboard' },
  { code: MENU.LIVE_CHAT, path: '/live-chat', labelKey: 'liveChat', requiredLabel: JOB_LABEL.CONSULT },
  { code: MENU.ISSUES, path: '/issues', labelKey: 'issueBoard', requiredLabel: JOB_LABEL.CONSULT },
  { code: MENU.HISTORY, path: '/history', labelKey: 'history', requiredLabel: JOB_LABEL.CONSULT },
  { code: MENU.WORK_LOG, path: '/work-log', labelKey: 'workLog' },
  { code: MENU.STATISTICS, path: '/statistics', labelKey: 'statistics' },
  { code: MENU.AI_SETTINGS, path: '/ai-setting', labelKey: 'aiSettings' },
  { code: MENU.KNOWLEDGE, path: '/knowledge', labelKey: 'knowledge', requiredLabel: JOB_LABEL.OPERATIONS },
  { code: MENU.PRODUCTS, path: '/products', labelKey: 'products', requiredLabel: JOB_LABEL.OPERATIONS },
  { code: MENU.CUSTOMERS, path: '/customers', labelKey: 'customers', requiredLabel: JOB_LABEL.OPERATIONS },
  { code: MENU.ORDERS, path: '/orders', labelKey: 'orders', requiredLabel: JOB_LABEL.OPERATIONS },
  { code: MENU.CAMPAIGNS, path: '/campaigns', labelKey: 'campaigns', requiredLabel: JOB_LABEL.OPERATIONS },
  { code: MENU.REVIEWS, path: '/reviews', labelKey: 'reviews', requiredLabel: JOB_LABEL.OPERATIONS },
  { code: MENU.USERS, path: '/users', labelKey: 'users' },
  { code: MENU.SETTINGS, path: '/settings', labelKey: 'settings' },
  { code: MENU.PRIVACY_NOTICE, path: '/privacy-notice', labelKey: 'privacyNotice' },
] as const;

export const ALL_MENU_CODES: readonly MenuCode[] = MENU_CATALOG.map((m) => m.code);

export function isMenuCode(value: string): value is MenuCode {
  return (ALL_MENU_CODES as readonly string[]).includes(value);
}

/**
 * Plan presets — which menus a plan includes before any per-tenant override.
 *
 * A plan the map does not know (including `null`, which most existing tenants
 * carry) provisions EVERYTHING. Defaulting to "nothing" would have silently
 * emptied every live console the moment this shipped.
 */
export const PLAN_MENUS: Record<string, readonly MenuCode[]> = {
  starter: [
    MENU.DASHBOARD,
    MENU.LIVE_CHAT,
    MENU.HISTORY,
    MENU.KNOWLEDGE,
    MENU.CUSTOMERS,
    MENU.ORDERS,
    MENU.USERS,
    MENU.SETTINGS,
    MENU.PRIVACY_NOTICE,
  ],
  growth: [
    MENU.DASHBOARD,
    MENU.LIVE_CHAT,
    MENU.HISTORY,
    MENU.WORK_LOG,
    MENU.STATISTICS,
    MENU.AI_SETTINGS,
    MENU.KNOWLEDGE,
    MENU.PRODUCTS,
    MENU.CUSTOMERS,
    MENU.ORDERS,
    MENU.CAMPAIGNS,
    MENU.REVIEWS,
    MENU.USERS,
    MENU.SETTINGS,
    MENU.PRIVACY_NOTICE,
  ],
  enterprise: ALL_MENU_CODES,
};

/** Platform-admin override of a plan preset, per tenant per menu. */
export const MENU_PROVISION_MODE = { PLAN: 'plan', ON: 'on', OFF: 'off' } as const;
export type MenuProvisionMode = (typeof MENU_PROVISION_MODE)[keyof typeof MENU_PROVISION_MODE];

/** Tenant override of the rank matrix, per user per menu. */
export const MENU_ACCESS_MODE = { DEFAULT: 'default', ALLOW: 'allow', DENY: 'deny' } as const;
export type MenuAccessMode = (typeof MENU_ACCESS_MODE)[keyof typeof MENU_ACCESS_MODE];
