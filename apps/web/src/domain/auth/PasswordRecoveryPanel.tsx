import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { authService } from './auth.service';
import { toast } from '@/store/toast-store';
import { PASSWORD_POLICY_ERROR_CODE, validatePasswordClient } from './password-policy';
import { PasswordField, RULE_LABEL_KEY, RULE_ORDER } from './PasswordField';

/** E1013 — recovery attempts exceeded their own quota (independent of the login lock). */
const RECOVERY_RATE_LIMITED_CODE = 'E1013';
/** E1014 — server has no mail delivery configured; only the admin can help. */
const EMAIL_UNAVAILABLE_CODE = 'E1014';

export type RecoveryMode = 'temp-request' | 'change';

/**
 * Inline lockout-recovery panel on the tenant login page (PLN-260824 S3).
 * Replaces the login form while open; both flows work while the account is
 * locked out. The temp-request confirmation is deliberately NEUTRAL — it must
 * not reveal whether the account exists (REQ-260824 §4).
 */
export function PasswordRecoveryPanel({
  mode,
  slug,
  onClose,
  onChanged,
}: {
  mode: RecoveryMode;
  slug: string;
  onClose: () => void;
  /** Called after a successful password change with the verified email. */
  onChanged: (email: string) => void;
}) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const policy = validatePasswordClient(next);

  const errorToast = (e: unknown) => {
    const code = (e as Error & { code?: string }).code;
    if (code === RECOVERY_RATE_LIMITED_CODE) toast.error(t('recoveryRateLimited'));
    else if (code === EMAIL_UNAVAILABLE_CODE) toast.error(t('recoveryEmailUnavailable'));
    else if (code === PASSWORD_POLICY_ERROR_CODE) toast.error(t('passwordPolicyFailed'));
    else toast.error(e instanceof Error ? e.message : t('loginFailed'));
  };

  const submitTempRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.tempPasswordRequest(slug, email.trim());
      // Neutral on purpose — same message whether or not the account exists.
      setRequested(true);
      toast.success(t('recoveryTempSent'));
    } catch (err) {
      errorToast(err);
    } finally {
      setLoading(false);
    }
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error(t('passwordsDoNotMatch'));
      return;
    }
    if (!policy.ok) {
      toast.error(t('passwordPolicyFailed'));
      return;
    }
    setLoading(true);
    try {
      await authService.passwordChangeSelf(slug, email.trim(), current, next);
      toast.success(t('recoveryChanged'));
      onChanged(email.trim());
    } catch (err) {
      errorToast(err);
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'temp-request') {
    return (
      <div>
        <h2 className="mb-1 font-medium text-gray-800">{t('recoveryTempTitle')}</h2>
        <p className="mb-4 text-sm text-gray-500">{t('recoveryTempDesc')}</p>
        {requested ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('recoveryTempSent')}</p>
          </div>
        ) : (
          <form onSubmit={submitTempRequest}>
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
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('recoveryTempSubmit')}
            </Button>
          </form>
        )}
        <Button variant="secondary" className="mt-2 w-full" onClick={onClose}>
          {requested ? t('backToLogin') : tc('cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 font-medium text-gray-800">{t('recoveryChangeTitle')}</h2>
      <p className="mb-4 text-sm text-gray-500">{t('recoveryChangeDesc')}</p>
      <form onSubmit={submitChange}>
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
        <FormRow label={t('currentOrTempPassword')}>
          <PasswordField value={current} onChange={setCurrent} />
        </FormRow>
        <FormRow label={t('newPassword')}>
          <PasswordField value={next} onChange={setNext} />
          <ul className="mt-1.5 space-y-0.5 text-xs" aria-live="polite">
            {RULE_ORDER.map((rule) => {
              const ok = policy.rules[rule];
              const tone = !next ? 'text-gray-400' : ok ? 'text-green-600' : 'text-red-600';
              return (
                <li key={rule} className={`flex items-center gap-1 ${tone}`}>
                  <span aria-hidden>{!next ? '•' : ok ? '✓' : '✕'}</span>
                  {t(RULE_LABEL_KEY[rule])}
                </li>
              );
            })}
          </ul>
        </FormRow>
        <FormRow label={t('confirmPassword')}>
          <PasswordField value={confirm} onChange={setConfirm} />
        </FormRow>
        <Button
          type="submit"
          className="mt-2 w-full"
          disabled={loading || !email || !current || !next || !policy.ok}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('recoveryChangeSubmit')}
        </Button>
      </form>
      <Button variant="secondary" className="mt-2 w-full" onClick={onClose}>
        {tc('cancel')}
      </Button>
    </div>
  );
}
