import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuthStore } from '@/store/auth-store';
import { useMenuAccess } from '@/lib/use-menu-access';
import { ADMIN_NAV, TENANT_NAV, type NavItem } from '@/layouts/nav-config';

/**
 * Every screen this user can reach, as cards (PLN-260808-Console-Menu-Overview).
 *
 * Reached from the sidebar logo, which until now did nothing — in most consoles
 * a logo goes home, so clicking it and getting nothing reads as broken.
 *
 * The card list is derived from `nav-config`, the same source the sidebar reads.
 * Declaring the cards separately would leave this page quietly out of date the
 * first time someone adds a menu item.
 */
export function MenuPage() {
  const { t } = useTranslation(['menu', 'nav']);
  const principal = useAuthStore((s) => s.principal);
  const tenantName = useAuthStore((s) => s.tenantName);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const isAdmin = principal?.actorType === 'admin';

  const { canSeeMenu } = useMenuAccess();
  const items: NavItem[] = isAdmin
    ? ADMIN_NAV
    : TENANT_NAV.filter((i) => canSeeMenu(i.code, i.capability));

  // My Page lives at the bottom of the sidebar, away from the nav list, which
  // makes it easy to miss entirely. It belongs in a screen called "all menus".
  const cards: NavItem[] = [
    ...items,
    { to: isAdmin ? '/admin/my-page' : '/my-page', labelKey: 'myPage', icon: UserCircle },
  ];

  return (
    <div>
      <PageHeader
        title={t('menu:title')}
        subtitle={t('menu:subtitle', {
          scope: isAdmin ? t('nav:platformAdmin') : (tenantName ?? tenantSlug ?? 'ShopTalk'),
        })}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group flex gap-3 rounded-lg border border-gray-200 bg-white p-5 transition-colors hover:border-primary-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 group-hover:text-primary-600">
                  {t(`nav:${item.labelKey}`)}
                </p>
                {/* Falls back to nothing rather than showing a raw key: a card
                    with just its name is still usable. */}
                <p className="mt-1 text-sm text-gray-500">
                  {t(`menu:items.${item.labelKey}`, { defaultValue: '' })}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
