import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import type { ScenarioLang } from './ai-settings.service';
// Runtime table from the registry source — '@ivy/types' publishes CJS, which the
// bundler cannot trace a named export through (see apps/web/src/i18n/i18n.ts).
import { LANGUAGES } from '../../../../../packages/types/src/common/language';

/**
 * Per-language tab row shared by the copy editors (scenario replies, handoff
 * notices). Three tabs fitted on one line and it was obvious which languages a
 * tenant had filled in; six wrap, and "which ones are still empty" stops being
 * obvious — hence `filled`, which marks the tabs that already carry text. A
 * blank language is not an error (it falls back to English at read time), but
 * it should be visible rather than discovered by a customer.
 */
export function LanguageTabs({
  value,
  onChange,
  filled,
}: {
  value: ScenarioLang;
  onChange: (lang: ScenarioLang) => void;
  filled?: Partial<Record<string, string | undefined>>;
}) {
  const { t } = useTranslation('nav');

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t('language')}>
      {LANGUAGES.map((lang) => {
        const code = lang.session as ScenarioLang;
        const hasText = Boolean(filled?.[code]?.trim());
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={code === value}
            title={lang.nativeLabel}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-xs',
              code === value
                ? 'bg-primary-500 text-white'
                : 'border border-gray-200 bg-white text-gray-600',
            )}
          >
            {code}
            {filled && (
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  hasText
                    ? code === value
                      ? 'bg-white'
                      : 'bg-primary-500'
                    : 'bg-transparent ring-1 ring-gray-300',
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
