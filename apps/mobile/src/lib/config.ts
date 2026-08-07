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

export const SUPPORTED_LANGUAGES = ['en', 'es', 'ko'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
