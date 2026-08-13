import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import { TENANT_NAV } from '@/layouts/nav-config';
import { useMenuAccess } from '@/lib/use-menu-access';
import { useAuthStore } from '@/store/auth-store';

/**
 * Blocks a console screen the user may not reach (PLN-260812 S4).
 *
 * The sidebar already hides those menus, but a typed URL, a bookmark or a link
 * in an old email walks straight past that. The API refuses too; this exists so
 * the answer is a sentence rather than a screen of failed requests.
 *
 * Resolution goes through the same `useMenuAccess`, so while the server's list
 * is still loading (or unreachable) the legacy local calculation decides and
 * nobody is locked out of a screen they have always had.
 */
export function MenuGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation('nav');
  const location = useLocation();
  const isAdmin = useAuthStore((s) => s.principal?.actorType) === 'admin';
  const { canSeeMenu } = useMenuAccess();

  // Longest matching path wins, so a nested route resolves to its own screen
  // rather than to a shorter prefix.
  const item = TENANT_NAV.filter(
    (i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`),
  ).sort((a, b) => b.to.length - a.to.length)[0];

  // Platform admins use their own nav; screens with no catalog entry (my page,
  // the all-menus overview) are not gated.
  if (isAdmin || !item || canSeeMenu(item.code, item.capability)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Ban className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-base font-semibold text-gray-900">{t('blocked.title')}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">{t('blocked.description')}</p>
      <Link
        to="/dashboard"
        className="mt-5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
      >
        {t('blocked.goHome')}
      </Link>
    </div>
  );
}
