import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/layouts/Header';

/**
 * Shared frame for the public auth pages (/<slug> and /admin/login):
 * centered card with brand mark, locale toggle and a way back to the landing page.
 */
export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { t } = useTranslation('auth');
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 items-start justify-center p-4 pt-[10vh]">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center">
            <Link
              to="/"
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white"
              aria-label={t('backToHome')}
            >
              <Sparkles className="h-6 w-6" />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">IVY TalkTalk</h1>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6">{children}</div>
          <p className="mt-4 text-center">
            <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
              {t('backToHome')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
