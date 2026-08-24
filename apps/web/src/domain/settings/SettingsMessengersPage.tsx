import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { MessengerChannelsSection } from './SettingsPage';

/** Tenant settings — messengers (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsMessengersPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('groups.messengers.title')} subtitle={t('groups.messengers.subtitle')} />
      <MessengerChannelsSection />
    </div>
  );
}
