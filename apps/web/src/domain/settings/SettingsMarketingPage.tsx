import { useTranslation } from 'react-i18next';
import { ProviderGrid } from './ProviderGrid';
import { MARKETING_PROVIDERS, HELPDESK_PROVIDERS } from './integration-providers';

/** Tenant settings — marketing (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsMarketingPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      {/* The tab already names the section; this says what it is for. */}
      <p className="text-sm text-gray-500">{t('groups.marketing.subtitle')}</p>
      <ProviderGrid providers={[...MARKETING_PROVIDERS, ...HELPDESK_PROVIDERS]} />
    </div>
  );
}
