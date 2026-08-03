import { useState } from 'react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, SearchX, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from './auth.service';
import { AuthShell } from './AuthShell';
import { LoginForm } from './LoginForm';
import { MfaChallengeForm } from './MfaChallengeForm';
import { useAuthStore } from '@/store/auth-store';
import { getErrorStatus } from '@/lib/api-client';
import { toast } from '@/store/toast-store';
import { isMfaRequired, type LoginResponse } from '@/lib/types';

/** Per-tenant login page at /<slug> (FR: tenant-scoped sign-in). */
export function TenantLoginPage() {
  const { t } = useTranslation('auth');
  // Param name must match the router's `/:tenantSlug` definition.
  const { tenantSlug: slug = '' } = useParams<{ tenantSlug: string }>();
  const principal = useAuthStore((s) => s.principal);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setTenant = useAuthStore((s) => s.setTenant);
  const navigate = useNavigate();

  // Step-up token when the account has MFA enabled (null = password step).
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['public-tenant', slug],
    queryFn: () => authService.publicTenant(slug),
    // Never fire with an empty slug — /tenants/by-slug/ would fall through to
    // the admin-only /tenants/:id route and 401.
    enabled: !!slug,
    retry: (count, err) => getErrorStatus(err) !== 404 && count < 2,
    staleTime: 60_000,
  });

  // Already signed in → straight to the matching home.
  if (principal) {
    return <Navigate to={principal.actorType === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  // Shared success path for both a plain login and a verified MFA challenge.
  const finishLogin = (res: LoginResponse) => {
    setAuth(res);
    setTenant(slug, tenant?.name ?? slug);
    toast.success(t('signedIn'));
    navigate('/dashboard', { replace: true });
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await authService.userLogin(email, password, slug);
      if (isMfaRequired(res)) {
        setMfaToken(res.mfaToken);
        return;
      }
      finishLogin(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loginFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !tenant) {
    const notFound = getErrorStatus(error) === 404;
    return (
      <AuthShell subtitle={t('workspaceSignIn')}>
        <div className="flex flex-col items-center py-6 text-center">
          <SearchX className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-800">
            {notFound ? t('tenantNotFoundTitle', { slug }) : t('tenantLoadFailed')}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {notFound ? t('tenantNotFoundDesc') : t('tryAgainLater')}
          </p>
          <Link to="/" className="mt-4 text-sm font-medium text-primary-600 hover:underline">
            {t('backToHome')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (tenant.status === 'suspended') {
    return (
      <AuthShell tenantName={tenant.name ?? tenant.slug}>
        <div className="flex flex-col items-center py-6 text-center">
          <Ban className="mb-3 h-10 w-10 text-amber-400" />
          <p className="font-medium text-gray-800">{t('tenantSuspendedTitle')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('tenantSuspendedDesc')}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell tenantName={tenant.name ?? tenant.slug}>
      {mfaToken ? (
        <MfaChallengeForm
          mfaToken={mfaToken}
          onSuccess={finishLogin}
          onExpired={() => setMfaToken(null)}
          onCancel={() => setMfaToken(null)}
        />
      ) : (
        <LoginForm
          onSubmit={login}
          rememberKey={`shoptalk_email:${slug}`}
          devHint={import.meta.env.DEV ? 'dev@amoeba.group / amb2026!@' : undefined}
        />
      )}
    </AuthShell>
  );
}
