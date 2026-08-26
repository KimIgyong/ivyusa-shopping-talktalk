import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProviderGrid } from './ProviderGrid';
import { Cafe24ConnectCard } from './Cafe24ConnectCard';
import { SelfDevelopmentCard } from './SelfDevelopmentCard';
import { ECOMMERCE_PROVIDERS } from './integration-providers';

/** Manual guide languages that exist under public/manual (PLN-260826). */
const GUIDE_LANGS = ['ko', 'en', 'vi'] as const;

/** Tenant settings — platforms (PLN-260824 B). Composition only; every card moved here unchanged. */
export function SettingsPlatformsPage() {
  const { t, i18n } = useTranslation('settings');

  // The credential guide is a static /manual page (works regardless of console
  // auth); fall back to Korean for any UI language it isn't translated into.
  const guideLang = (GUIDE_LANGS as readonly string[]).includes(i18n.language)
    ? i18n.language
    : 'ko';

  return (
    <div className="space-y-6">
      {/* The tab already names the section; this says what it is for, and links
          out to "where do these credentials come from" (PLN-260826). */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500">{t('groups.platforms.subtitle')}</p>
        <a
          href={`/manual/platform-integration.${guideLang}.html`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-primary-300 hover:text-primary-700"
        >
          <BookOpen className="h-4 w-4" />
          {t('integrationGuide')}
        </a>
      </div>
      <ProviderGrid providers={ECOMMERCE_PROVIDERS} includeShopify />
      {/* Cafe24 needs an OAuth round trip the generic credential form cannot do. */}
      <Cafe24ConnectCard />
      <SelfDevelopmentCard />
    </div>
  );
}
