import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authService } from './auth.service';
import { AuthShell } from './AuthShell';
import { LoginForm } from './LoginForm';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';

/** System-admin login at /admin/login. */
export function AdminLoginPage() {
  const { t } = useTranslation('auth');
  const principal = useAuthStore((s) => s.principal);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  if (principal) {
    return <Navigate to={principal.actorType === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  const login = async (email: string, password: string) => {
    try {
      const res = await authService.adminLogin(email, password);
      setAuth(res);
      toast.success(t('signedIn'));
      navigate('/admin', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loginFailed'));
    }
  };

  return (
    <AuthShell subtitle={t('adminSubtitle')}>
      <LoginForm
        onSubmit={login}
        devHint={import.meta.env.DEV ? 'admin@amoeba.group / amb2026!@' : undefined}
      />
    </AuthShell>
  );
}
