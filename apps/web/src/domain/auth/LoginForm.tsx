import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';

/** Email + password form shared by the tenant and admin login pages. */
export function LoginForm({
  onSubmit,
  devHint,
}: {
  onSubmit: (email: string, password: string) => Promise<void>;
  devHint?: string;
}) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      {devHint && (
        <p className="mt-4 text-center text-xs text-gray-400">{t('devCredentials', { hint: devHint })}</p>
      )}
    </>
  );
}
