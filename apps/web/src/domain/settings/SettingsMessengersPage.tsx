import { useTranslation } from 'react-i18next';
import { MessengerChannelsSection } from './SettingsPage';

/** Tenant settings — messengers (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsMessengersPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      {/* The tab already names the section; this says what it is for. */}
      <p className="text-sm text-gray-500">{t('groups.messengers.subtitle')}</p>
      <MessengerChannelsSection />
    </div>
  );
}
