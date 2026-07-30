import { PanelLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/store/ui-store';
import { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY, type SupportedLanguage } from '@/i18n/i18n';
import { cn } from '@/lib/cn';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'EN',
  es: 'ES',
  ko: '한국어',
};

// Exported for reuse on the public pages (landing / login), which render
// outside AppLayout but still need the locale toggle.
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('nav');
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : 'en';

  const change = (code: SupportedLanguage) => {
    if (code === current) return;
    i18n.changeLanguage(code);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5"
      role="group"
      aria-label={t('language')}
    >
      {SUPPORTED_LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => change(code)}
          aria-pressed={current === code}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-medium transition-colors',
            current === code
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          {LANGUAGE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}

/**
 * Slim top bar: sidebar toggle + locale switcher. The signed-in user block
 * (identity / My Page / logout) lives pinned at the bottom of the Sidebar.
 */
export function Header() {
  const { t } = useTranslation('nav');
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        aria-label={t('toggleSidebar')}
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <LanguageSwitcher />
    </header>
  );
}
