/**
 * Build-time configuration (VITE_* vars are inlined by Vite).
 * One build = one tenant: shop_domain is fixed per build (REQ-MobileApp G9 —
 * /session/ensure 400s in a multi-tenant deployment without an explicit domain).
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://shoptalk.amoeba.site/api/v1';

export const SHOP_DOMAIN = import.meta.env.VITE_SHOP_DOMAIN ?? 'ambshop-dev.myshopify.com';

/** Storefront opens in a NEW TAB — Shopify forbids iframing (REQ-PWA C1). */
export const STOREFRONT_URL = `https://${SHOP_DOMAIN}`;

// Runtime table from the registry source: '@ivy/types' publishes CJS and the
// bundler cannot trace a named export through its `export *` chain.
import { LANGUAGES, LANGUAGE_CODES } from '../../../../packages/types/src/common/language';

/** Languages this app offers — derived from the shared registry. */
export const SUPPORTED_LANGUAGES = LANGUAGE_CODES;
export type AppLanguage = string;

/** Endonym + review state for the language picker. */
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  code: l.code,
  nativeLabel: l.nativeLabel,
  reviewed: l.reviewed,
}));
