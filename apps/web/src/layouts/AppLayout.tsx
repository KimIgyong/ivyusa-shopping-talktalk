import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUiStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { ChangePasswordModal } from '@/domain/auth/ChangePasswordModal';
import { MfaSettings } from '@/domain/auth/MfaSettings';
import { EscalationAlarm } from '@/domain/live-chat/EscalationAlarm';
import { Modal } from '@/components/Modal';
import { MenuGuard } from '@/components/MenuGuard';
import { cn } from '@/lib/cn';

export function AppLayout() {
  const { t, i18n } = useTranslation('auth');
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  const mfaRequired = useAuthStore((s) => s.mfaEnrollmentRequired);
  const mfaEnforced = useAuthStore((s) => s.mfaEnforced);
  const mfaEnforceFrom = useAuthStore((s) => s.mfaEnforceFrom);
  const actorType = useAuthStore((s) => s.principal?.actorType);
  const [graceDismissed, setGraceDismissed] = useState(false);

  const myPagePath = actorType === 'admin' ? '/admin/my-page' : '/my-page';
  const graceDeadline = mfaEnforceFrom
    ? new Date(mfaEnforceFrom).toLocaleDateString(i18n.language)
    : '';
  const showGraceBanner = mfaRequired && !mfaEnforced && !graceDismissed;

  return (
    <div className="min-h-full">
      <Sidebar />
      <div className={cn('transition-[margin] duration-200', collapsed ? 'ml-[64px]' : 'ml-[240px]')}>
        <Header />
        {/* MFA grace-period advisory (PLN-MFA M3): required rank, deadline not yet passed. */}
        {showGraceBanner && (
          <div className="mx-auto mt-4 flex max-w-content items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              {t('mfaGraceBanner', { date: graceDeadline })}{' '}
              <Link to={myPagePath} className="font-medium underline">
                {t('mfaGraceLink')}
              </Link>
            </span>
            <button
              type="button"
              aria-label={t('mfaGraceDismiss')}
              onClick={() => setGraceDismissed(true)}
              className="rounded p-1 hover:bg-amber-100"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        {/* One gate for every console route (PLN-260812 S4): the sidebar hides
            menus a member may not reach, but a typed URL or an old bookmark
            walks straight past that. */}
        <main className="mx-auto max-w-content p-6">
          <MenuGuard>
            <Outlet />
          </MenuGuard>
        </main>
      </div>
      {/* Forced first-login rotation only; voluntary changes live on My Page. */}
      <ChangePasswordModal open={mustChange} forced={mustChange} onClose={() => undefined} />
      {/* MFA enrollment lockout (PLN-MFA M3): past the deadline the access token
          only works on enrollment routes — block the console until MFA is
          active. Password rotation takes precedence so modals never stack. */}
      <Modal open={!mustChange && mfaEnforced} title={t('mfaForcedTitle')} size="lg">
        <p className="mb-4 text-sm text-gray-500">{t('mfaForcedDesc')}</p>
        <MfaSettings />
      </Modal>
      {/* Escalation alarm modal (FR-S3) — global so it fires on any page. */}
      <EscalationAlarm />
    </div>
  );
}
