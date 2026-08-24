import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { ProviderGrid } from './ProviderGrid';
import { Cafe24ConnectCard } from './Cafe24ConnectCard';
import { SelfDevelopmentCard } from './SelfDevelopmentCard';
import { ECOMMERCE_PROVIDERS } from './integration-providers';

/** Tenant settings — platforms (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsPlatformsPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('groups.platforms.title')} subtitle={t('groups.platforms.subtitle')} />
      <ProviderGrid providers={ECOMMERCE_PROVIDERS} includeShopify />
      {/* Cafe24 needs an OAuth round trip the generic credential form cannot do. */}
      <Cafe24ConnectCard />
      <SelfDevelopmentCard />
    </div>
  );
}
