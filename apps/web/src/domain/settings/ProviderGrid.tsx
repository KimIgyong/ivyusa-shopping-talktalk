import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderTile } from './ProviderTile';
import { ShopifyConfigModal } from './ShopifyConfigModal';
import { IntegrationConfigModal } from './IntegrationConfigModal';
import { useIntegration, useShopifySettings } from './settings.hooks';
import type { GenericIntegrationProvider } from './integration-providers';
import { isShopifyDomain } from './integration-providers';

function ShopifyTile({ onConfigure }: { onConfigure: () => void }) {
  const { t } = useTranslation('settings');
  const { data } = useShopifySettings();
  // `shop_domain` is the tenant's store domain for ANY platform (the widget
  // resolves the tenant by it), so a Cafe24 mall lives there too. Showing it
  // here made those tenants look like Shopify stores — only a real
  // *.myshopify.com domain belongs on this tile.
  const domain = isShopifyDomain(data?.shopDomain) ? data?.shopDomain : null;
  return (
    <ProviderTile
      title={t('shopify.title')}
      subtitle={domain || t('shopify.shopDomainPlaceholder')}
      status={data?.integration?.status}
      configured={data?.credential.configured}
      lastTested={data?.integration?.lastSyncAt}
      onConfigure={onConfigure}
    />
  );
}

/** Generic provider summary tile (cafe24/woocommerce/odoo/haravan/klaviyo/…). */
function GenericTile({
  provider,
  onConfigure,
}: {
  provider: GenericIntegrationProvider;
  onConfigure: () => void;
}) {
  const { t } = useTranslation('settings');
  const { data } = useIntegration(provider);
  return (
    <ProviderTile
      title={t(`integrations.${provider}.title`)}
      subtitle={t(`integrations.${provider}.subtitle`)}
      status={data?.integration?.status}
      configured={data?.credential.configured}
      lastTested={data?.integration?.lastSyncAt}
      onConfigure={onConfigure}
    />
  );
}

/**
 * A group of provider tiles and the config dialogs they open (PLN-260824 B).
 *
 * Owns its own "which one is being configured" state, so the pages that use it
 * are composition and nothing else — which is what made splitting the settings
 * screen a move rather than a rewrite.
 */
export function ProviderGrid({
  providers,
  includeShopify = false,
}: {
  providers: readonly GenericIntegrationProvider[];
  includeShopify?: boolean;
}) {
  const [configuring, setConfiguring] = useState<'shopify' | GenericIntegrationProvider | null>(
    null,
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {includeShopify ? <ShopifyTile onConfigure={() => setConfiguring('shopify')} /> : null}
        {providers.map((p) => (
          <GenericTile key={p} provider={p} onConfigure={() => setConfiguring(p)} />
        ))}
      </div>

      {includeShopify ? (
        <ShopifyConfigModal open={configuring === 'shopify'} onClose={() => setConfiguring(null)} />
      ) : null}
      {providers.map((p) => (
        <IntegrationConfigModal
          key={p}
          provider={p}
          open={configuring === p}
          onClose={() => setConfiguring(null)}
        />
      ))}
    </>
  );
}
