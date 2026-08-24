import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { ProviderGrid } from './ProviderGrid';
import { MARKETING_PROVIDERS, HELPDESK_PROVIDERS } from './integration-providers';

/** Tenant settings — marketing (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsMarketingPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('groups.marketing.title')} subtitle={t('groups.marketing.subtitle')} />
      <ProviderGrid providers={[...MARKETING_PROVIDERS, ...HELPDESK_PROVIDERS]} />
    </div>
  );
}
