import { useTranslation } from 'react-i18next';
import { LANG_STORAGE_KEY, SUPPORTED_LANGUAGES } from '../../i18n/i18n';
import { useWidgetStore } from '../../store/widgetStore';
import { setSessionLanguage } from '../../services/sessionService';

const LABELS: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  ko: '한국어',
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const setLanguage = useWidgetStore((s) => s.setLanguage);

  const current = (i18n.language || 'en').split('-')[0];

  function changeTo(code: string) {
    if (code === current) return;
    void i18n.changeLanguage(code);
    setLanguage(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* ignore storage failures */
    }
    if (sessionToken) {
      setSessionLanguage(sessionToken, code.toUpperCase()).catch(() => {});
    }
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5">
      {SUPPORTED_LANGUAGES.map((code) => {
        const active = code === current;
        return (
          <button
            key={code}
            type="button"
            onClick={() => changeTo(code)}
            aria-pressed={active}
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
              active ? 'bg-white text-primary-600' : 'text-white/80 hover:bg-white/20'
            }`}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
