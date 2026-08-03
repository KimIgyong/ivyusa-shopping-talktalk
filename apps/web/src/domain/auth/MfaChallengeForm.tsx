import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { authService, MFA_CODE_INVALID_ERROR_CODE } from './auth.service';
import { getErrorStatus } from '@/lib/api-client';
import { toast } from '@/store/toast-store';
import type { LoginResponse } from '@/lib/types';

const TOTP_LENGTH = 6;

/**
 * Second step of an MFA login (wireframe PLN-MFA §4.1), shared by the tenant
 * and admin login pages. Verifies the 6-digit TOTP (or a recovery code) against
 * POST /auth/mfa/verify using the short-lived `mfaToken` from step 1.
 *
 * - E1011 → inline error, stay on this step.
 * - 401 (expired mfaToken) → sticky toast + `onExpired` (back to step 1).
 */
export function MfaChallengeForm({
  mfaToken,
  onSuccess,
  onExpired,
  onCancel,
}: {
  mfaToken: string;
  onSuccess: (res: LoginResponse) => void;
  onExpired: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('auth');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = () => {
    setRecoveryMode((v) => !v);
    setCode('');
    setError(null);
  };

  const canSubmit = recoveryMode
    ? code.trim().length > 0
    : code.trim().length === TOTP_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authService.mfaVerify(mfaToken, code.trim());
      onSuccess(res);
    } catch (err) {
      const status = getErrorStatus(err);
      const errCode = (err as Error & { code?: string }).code;
      if (status === 401) {
        // The 5-minute mfaToken expired — restart from the password step.
        toast.error(t('mfaSessionExpired'), { sticky: true });
        onExpired();
      } else if (errCode === MFA_CODE_INVALID_ERROR_CODE) {
        setError(t('mfaCodeInvalid'));
      } else {
        setError(err instanceof Error ? err.message : t('mfaCodeInvalid'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-4 flex flex-col items-center text-center">
        <ShieldCheck className="mb-2 h-8 w-8 text-primary-500" aria-hidden />
        <h2 className="text-base font-semibold text-gray-900">{t('mfaStepTitle')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {recoveryMode ? t('mfaRecoveryPrompt') : t('mfaCodePrompt')}
        </p>
      </div>

      <FormRow label={recoveryMode ? t('mfaRecoveryLabel') : t('mfaCodeLabel')}>
        <Input
          type="text"
          value={code}
          onChange={(e) => {
            const raw = e.target.value;
            setCode(recoveryMode ? raw : raw.replace(/\D/g, '').slice(0, TOTP_LENGTH));
            setError(null);
          }}
          placeholder={recoveryMode ? t('mfaRecoveryPlaceholder') : t('mfaCodePlaceholder')}
          inputMode={recoveryMode ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          maxLength={recoveryMode ? 32 : TOTP_LENGTH}
          className="text-center font-mono text-lg tracking-[0.3em]"
          autoFocus
          required
        />
      </FormRow>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('mfaVerify')}
      </Button>

      <div className="mt-4 space-y-1 text-center">
        <button
          type="button"
          onClick={switchMode}
          className="block w-full text-sm font-medium text-primary-600 hover:underline"
        >
          {recoveryMode ? t('mfaUseTotp') : t('mfaUseRecovery')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="block w-full text-xs text-gray-400 hover:text-gray-600"
        >
          {t('mfaBack')}
        </button>
      </div>
    </form>
  );
}
