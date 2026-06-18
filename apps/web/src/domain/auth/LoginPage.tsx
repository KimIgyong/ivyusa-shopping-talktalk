import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from './auth.service';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/cn';

type Mode = 'user' | 'admin';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const [mode, setMode] = useState<Mode>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res =
        mode === 'admin'
          ? await authService.adminLogin(email, password)
          : await authService.userLogin(email, password);
      setAuth(res);
      toast.success(t('signedIn'));
      navigate(res.principal.actorType === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const hint =
    mode === 'admin' ? 'admin@amoeba.group / amb2026!@' : 'dev@amoeba.group / amb2026!@';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">IVY TalkTalk</h1>
          <p className="text-sm text-gray-500">{t('consoleSubtitle')}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            {(['user', 'admin'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md py-2 text-sm font-medium transition-colors',
                  mode === m ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500',
                )}
              >
                {m === 'user' ? t('tenantUser') : t('systemAdmin')}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <FormRow label={t('email')}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                autoFocus
              />
            </FormRow>
            <FormRow label={t('password')}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </FormRow>
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('signIn')}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-gray-400">{t('devCredentials', { hint })}</p>
        </div>
      </div>
    </div>
  );
}
