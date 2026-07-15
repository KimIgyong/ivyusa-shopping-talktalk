import type { EcommerceProvider, IntegrationFieldSpec } from '@ivy/types';

/**
 * Web-side mirror of the e-commerce provider credential schema.
 *
 * The canonical source is `INTEGRATION_FIELDS` / `ECOMMERCE_PROVIDERS` in
 * `packages/types` — but that package builds to CommonJS and, because it is a
 * symlinked workspace dep, Vite/Rollup can't read its runtime values through the
 * barrel. Types are erased so `EcommerceProvider`/`IntegrationFieldSpec` still come
 * from `@ivy/types`; only these runtime constants are re-declared here.
 *
 * KEEP IN SYNC with packages/types/src/common/enum.types.ts.
 */
export const ECOMMERCE_PROVIDERS: EcommerceProvider[] = [
  'cafe24',
  'woocommerce',
  'odoo',
  'haravan',
];

export const INTEGRATION_FIELDS: Record<EcommerceProvider, IntegrationFieldSpec[]> = {
  cafe24: [
    { key: 'mall_id', secret: false, required: true },
    { key: 'client_id', secret: true, required: false },
    { key: 'client_secret', secret: true, required: false },
    { key: 'access_token', secret: true, required: true },
  ],
  woocommerce: [
    { key: 'store_url', secret: false, required: true },
    { key: 'consumer_key', secret: true, required: true },
    { key: 'consumer_secret', secret: true, required: true },
  ],
  odoo: [
    { key: 'url', secret: false, required: true },
    { key: 'db', secret: false, required: true },
    { key: 'username', secret: false, required: true },
    { key: 'api_key', secret: true, required: true },
  ],
  haravan: [
    { key: 'shop_domain', secret: false, required: true },
    { key: 'access_token', secret: true, required: true },
  ],
};
