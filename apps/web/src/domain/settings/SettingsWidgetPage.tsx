import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { WidgetThemeCard, WidgetTabsCard, WidgetBehaviorCard, InstallGuideCard } from './SettingsPage';
import { EmbedCard } from './EmbedCard';

/** Tenant settings — widget (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsWidgetPage() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('groups.widget.title')} subtitle={t('groups.widget.subtitle')} />
      <WidgetThemeCard />
      <WidgetTabsCard />
      <WidgetBehaviorCard />
      {/* Where the widget may be embedded, and how a host proves its visitor
          (PLN-260819). Sits next to the install guide because it is the same job. */}
      <EmbedCard />
      <InstallGuideCard />
    </div>
  );
}
