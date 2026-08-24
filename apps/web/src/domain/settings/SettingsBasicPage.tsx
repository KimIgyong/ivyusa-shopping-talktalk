import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { AiEngineCard } from './AiEngineCard';
import { AiUsageCard } from './AiUsageCard';
import { StorefrontCard } from './SettingsPage';
import { HandoffSection } from '../ai-settings/HandoffSection';

/** Tenant settings — basic (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsBasicPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('groups.basic.title')} subtitle={t('groups.basic.subtitle')} />
      <AiEngineCard />
      <AiUsageCard />
      <StorefrontCard />
      {/* Live-support routing: business hours, break, off-hours mailbox. */}
      <HandoffSection />
    </div>
  );
}
