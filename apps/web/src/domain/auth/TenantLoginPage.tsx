import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, SearchX, Ban, ShieldAlert, X } from 'lucide-react';
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

  // AMA-portal SSO (PLN-260813 S3): the iframe URL carries ?ama_token=. Capture
  // it once, then scrub it from the address bar before anything else can log or
  // copy the URL. 'pending' renders a full-page spinner instead of the form;
  // 'failed' falls back to the form with a dismissible banner.
  const [amaToken] = useState(() => new URLSearchParams(window.location.search).get('ama_token'));
  const [ssoState, setSsoState] = useState<'idle' | 'pending' | 'failed'>(
    amaToken ? 'pending' : 'idle',
  );
  const [ssoNotMapped, setSsoNotMapped] = useState(false);

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['public-tenant', slug],
    queryFn: () => authService.publicTenant(slug),
    // Never fire with an empty slug — /tenants/by-slug/ would fall through to
    // the admin-only /tenants/:id route and 401.
    enabled: !!slug,
    retry: (count, err) => getErrorStatus(err) !== 404 && count < 2,
    staleTime: 60_000,
  });

  // The SSO call may finish before the tenant query does — read the freshest
  // tenant name through a ref instead of the effect's stale closure.
  const tenantNameRef = useRef<string | undefined>(undefined);
  tenantNameRef.current = tenant?.name ?? undefined;

  useEffect(() => {
    if (!amaToken) return;
    // Scrub the token from the address bar first — it must never survive into
    // history, logs, or a copied link (PLN-260813 §S3).
    const url = new URL(window.location.href);
    url.searchParams.delete('ama_token');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (principal) return; // already signed in — the redirect below handles it
    let cancelled = false;
    authService
      .amaSso(amaToken, slug)
      .then((res) => {
        if (cancelled) return;
        setAuth(res);
        setTenant(slug, tenantNameRef.current ?? slug);
        toast.success(t('signedIn'));
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSsoNotMapped((err as { code?: string })?.code === 'E5031');
        setSsoState('failed');
      });
    return () => {
      cancelled = true;
    };
    // Runs exactly once per mount — amaToken and slug are fixed for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already signed in → straight to the matching home.
  if (principal) {
    return <Navigate to={principal.actorType === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  // SSO in flight — a full-page state instead of the login form (wireframe 1).
  if (ssoState === 'pending') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50"
        role="status"
      >
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <p className="text-sm text-gray-600">{t('amaSsoSigningIn')}</p>
      </div>
    );
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
      {ssoState === 'failed' && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t('amaSsoFailedTitle')}</p>
            <p className="mt-0.5">{ssoNotMapped ? t('amaSsoNotMapped') : t('amaSsoFailedDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => setSsoState('idle')}
            aria-label={t('amaSsoDismiss')}
            className="rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
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
