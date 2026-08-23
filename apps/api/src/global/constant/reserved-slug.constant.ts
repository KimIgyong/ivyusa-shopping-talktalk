/**
 * Top-level SPA path segments that can never be tenant slugs — the web app
 * routes /<slug> to the tenant login page, so a tenant named like a real route
 * (or a proxied prefix such as /api, /widget) would shadow it.
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  'admin',
  'login',
  'logout',
  'api',
  'assets',
  'widget',
  'dashboard',
  'live-chat',
  'history',
  'ai-setting',
  'knowledge',
  'customers',
  'orders',
  'campaigns',
  'users',
  'settings',
  'index',
  'static',
  'manual',
];

/** Lowercase letters/digits, single dashes inside, 1–64 chars. */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
