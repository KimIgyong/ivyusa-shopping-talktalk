/**
 * Web-side mirror of the e-commerce provider credential schema.
 *
 * The canonical source is `INTEGRATION_FIELDS` / `ECOMMERCE_PROVIDERS` /
 * `EcommerceProvider` / `IntegrationFieldSpec` in `packages/types`. The web app
 * does NOT depend on `@ivy/types` (it isn't in apps/web/package.json, so a clean
 * build never builds that package) and it builds to CommonJS which Vite can't read
 * runtime values from anyway — so both the types and the constants are re-declared
 * here to keep the web build self-contained.
 *
 * KEEP IN SYNC with packages/types/src/common/enum.types.ts.
 */
export type EcommerceProvider = 'cafe24' | 'woocommerce' | 'odoo' | 'haravan';

export interface IntegrationFieldSpec {
  key: string;
  secret: boolean;
  required: boolean;
}
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
