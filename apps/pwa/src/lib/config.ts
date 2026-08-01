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

export const SUPPORTED_LANGUAGES = ['en', 'es', 'ko'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
