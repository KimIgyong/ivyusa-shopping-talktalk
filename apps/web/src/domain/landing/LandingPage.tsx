import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Bot,
  MessagesSquare,
  ShoppingCart,
  Languages,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/layouts/Header';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/store/auth-store';

const FEATURES = [
  { icon: Bot, titleKey: 'featureAiTitle', descKey: 'featureAiDesc' },
  { icon: MessagesSquare, titleKey: 'featureChatTitle', descKey: 'featureChatDesc' },
  { icon: ShoppingCart, titleKey: 'featureCommerceTitle', descKey: 'featureCommerceDesc' },
  { icon: Languages, titleKey: 'featureI18nTitle', descKey: 'featureI18nDesc' },
] as const;

/** Public landing page at / — product intro + entry points to the login pages. */
export function LandingPage() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const [workspace, setWorkspace] = useState('');

  const goToWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = workspace.trim().toLowerCase();
    if (slug) navigate(`/${slug}`);
  };

  // Signed-in visitors get a direct path back to their console.
  const consoleTo = principal ? (principal.actorType === 'admin' ? '/admin' : '/dashboard') : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold text-gray-900">IVY TalkTalk</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {consoleTo ? (
            <Button size="sm" onClick={() => navigate(consoleTo)}>
              {t('goToConsole')}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Link
              to="/admin/login"
              className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              <ShieldCheck className="h-4 w-4" />
              {t('adminLogin')}
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-500">{t('heroSubtitle')}</p>

          {!principal && (
            <form
              onSubmit={goToWorkspace}
              className="mx-auto mt-8 flex w-full max-w-md items-center gap-2"
            >
              <div className="flex flex-1 items-center rounded-lg border border-gray-200 bg-white pl-3 focus-within:border-primary-400">
                <span className="text-sm text-gray-400">/</span>
                <input
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  placeholder={t('workspacePlaceholder')}
                  aria-label={t('workspaceLabel')}
                  className="w-full bg-transparent px-2 py-2 text-sm text-gray-800 outline-none"
                />
              </div>
              <Button type="submit" disabled={!workspace.trim()}>
                {t('signIn')}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </form>
          )}
          {!principal && tenantSlug && (
            <p className="mt-3 text-sm text-gray-400">
              <Link to={`/${tenantSlug}`} className="text-primary-600 hover:underline">
                {t('continueTo', { slug: tenantSlug })}
              </Link>
            </p>
          )}
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="font-semibold text-gray-900">{t(titleKey)}</h2>
              <p className="mt-1 text-sm text-gray-500">{t(descKey)}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs text-gray-400">
          <span>{t('footerCopy')}</span>
          <Link to="/admin/login" className="hover:text-gray-600">
            {t('adminLogin')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
