import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authService } from './auth.service';
import { AuthShell } from './AuthShell';
import { LoginForm } from './LoginForm';
import { MfaChallengeForm } from './MfaChallengeForm';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { isMfaRequired, type LoginResponse } from '@/lib/types';

/** System-admin login at /admin/login. */
export function AdminLoginPage() {
  const { t } = useTranslation('auth');
  const principal = useAuthStore((s) => s.principal);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  // Step-up token when the account has MFA enabled (null = password step).
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  if (principal) {
    return <Navigate to={principal.actorType === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  // Shared success path for both a plain login and a verified MFA challenge.
  const finishLogin = (res: LoginResponse) => {
    setAuth(res);
    toast.success(t('signedIn'));
    navigate('/admin', { replace: true });
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await authService.adminLogin(email, password);
      if (isMfaRequired(res)) {
        setMfaToken(res.mfaToken);
        return;
      }
      finishLogin(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loginFailed'));
    }
  };

  return (
    <AuthShell subtitle={t('adminSubtitle')}>
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
          rememberKey="shoptalk_email:admin"
          devHint={import.meta.env.DEV ? 'admin@amoeba.group / amb2026!@' : undefined}
        />
      )}
    </AuthShell>
  );
}
