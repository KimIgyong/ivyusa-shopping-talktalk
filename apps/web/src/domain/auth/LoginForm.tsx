import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';

/**
 * Email + password form shared by the tenant and admin login pages.
 * `rememberKey` enables the "remember email" checkbox — the email (never the
 * password) is kept in localStorage under that key.
 */
export function LoginForm({
  onSubmit,
  rememberKey,
  devHint,
}: {
  onSubmit: (email: string, password: string) => Promise<void>;
  rememberKey?: string;
  devHint?: string;
}) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  // Prefill the saved email once on mount.
  useEffect(() => {
    if (!rememberKey) return;
    try {
      const saved = localStorage.getItem(rememberKey);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* storage unavailable (private mode) */
    }
  }, [rememberKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rememberKey) {
      try {
        if (remember && email.trim()) localStorage.setItem(rememberKey, email.trim());
        else localStorage.removeItem(rememberKey);
      } catch {
        /* storage unavailable */
      }
    }
    setLoading(true);
    try {
      await onSubmit(email, password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              title={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormRow>
        {rememberKey && (
          <label className="mb-1 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            {t('rememberEmail')}
          </label>
        )}
        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('signIn')}
        </Button>
      </form>
      {devHint && (
        <p className="mt-4 text-center text-xs text-gray-400">{t('devCredentials', { hint: devHint })}</p>
      )}
    </>
  );
}
