/**
 * Build-time configuration (EXPO_PUBLIC_* vars are inlined by Expo).
 * One app build = one tenant: shop_domain is fixed per build (REQ-MobileApp G9 —
 * /session/ensure 400s in a multi-tenant deployment without an explicit domain).
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://shoptalk.amoeba.site/api/v1';

export const SHOP_DOMAIN = process.env.EXPO_PUBLIC_SHOP_DOMAIN ?? 'ambshop-dev.myshopify.com';

/**
 * Storefront origin rendered in the /shop WebView and used by the deep-link
 * resolver. Separate from SHOP_DOMAIN (the tenant key sent to /session/ensure):
 * a store can serve customers on a custom domain (e.g. ivyusa.com) while the
 * tenant stays keyed by its *.myshopify.com host — mirrors tenants.storefront_url.
 */
export const STOREFRONT_URL =
  process.env.EXPO_PUBLIC_STOREFRONT_URL ?? `https://${SHOP_DOMAIN}`;

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
