import { useTranslation } from 'react-i18next';
import { NotificationChannelsCard } from './SettingsPage';
import { MenuAccessSection } from './MenuAccessSection';
import { IntegrationCredentialsCard } from './IntegrationCredentialsCard';
import { useAuthStore } from '@/store/auth-store';

/** Tenant settings — etc (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsEtcPage() {
  const { t } = useTranslation('settings');
  const isMaster = useAuthStore((s) => s.principal?.rank) === 'master';

  return (
    <div className="space-y-6">
      {/* The tab already names the section; this says what it is for. */}
      <p className="text-sm text-gray-500">{t('groups.etc.subtitle')}</p>
      <NotificationChannelsCard />
      {/* Who on the team reaches which screen (PLN-260812 S3). Master-only:
          the API gates it on TENANT_SETTINGS_MANAGE, and rendering it for
          ranks that will only get a 403 is worse than not showing it. */}
      {isMaster && <MenuAccessSection />}
      <IntegrationCredentialsCard />
    </div>
  );
}
