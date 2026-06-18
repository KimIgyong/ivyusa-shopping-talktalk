import { useNavigate } from 'react-router-dom';
import { PanelLeft, LogOut, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth-store';
import { useUiStore } from '@/store/ui-store';
import { Badge } from '@/components/Badge';
import { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY, type SupportedLanguage } from '@/i18n/i18n';
import { cn } from '@/lib/cn';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'EN',
  es: 'ES',
  ko: '한국어',
};

function LanguageSwitcher() {
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

export function Header({ onChangePassword }: { onChangePassword: () => void }) {
  const { t } = useTranslation('nav');
  const principal = useAuthStore((s) => s.principal);
  const clear = useAuthStore((s) => s.clear);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();

  const logout = () => {
    clear();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        aria-label={t('toggleSidebar')}
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-4">
        <LanguageSwitcher />
        <div className="text-right leading-tight">
          <p className="text-sm font-medium text-gray-800">{principal?.email}</p>
          <div className="flex items-center justify-end gap-1">
            <Badge tone={principal?.actorType === 'admin' ? 'primary' : 'info'}>
              {principal?.actorType === 'admin' ? 'admin' : principal?.rank ?? 'user'}
            </Badge>
          </div>
        </div>
        <button
          onClick={onChangePassword}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          title={t('changePassword')}
        >
          <KeyRound className="h-5 w-5" />
        </button>
        <button
          onClick={logout}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          title={t('logout')}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
