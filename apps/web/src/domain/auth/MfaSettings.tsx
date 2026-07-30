import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { Modal } from '@/components/Modal';
import {
  authService,
  MFA_ALREADY_ENROLLED_ERROR_CODE,
  MFA_CODE_INVALID_ERROR_CODE,
} from './auth.service';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import type { MfaEnrollment } from '@/lib/types';

const TOTP_LENGTH = 6;

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function errorCodeOf(err: unknown): string | undefined {
  return (err as Error & { code?: string }).code;
}

/**
 * Settings > Security — MFA enrollment / disable (wireframe PLN-MFA §4.2).
 * Rendered as the body of a Card on My Page for both tenant users and admins.
 *
 * Flow: status → enroll (QR + manual key + 6-digit confirm) → recovery codes
 * shown ONCE (download + explicit "I saved them" confirm) → enrolled state
 * with the enabled date and a password+code disable form.
 */
export function MfaSettings() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const principal = useAuthStore((s) => s.principal);

  const statusKey = ['mfa-status', principal?.actorType, principal?.id];
  const { data: status, isLoading } = useQuery({
    queryKey: statusKey,
    queryFn: () => authService.mfaStatus(),
    enabled: !!principal,
  });

  // Pending enrollment (secret issued, not yet confirmed).
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Recovery codes — available ONCE, right after enroll/verify.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // Disable dialog state.
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);

  const enroll = useMutation({
    mutationFn: () => authService.mfaEnroll(),
    onSuccess: (res) => {
      setEnrollment(res);
      setConfirmCode('');
      setConfirmError(null);
      setSecretCopied(false);
    },
    onError: (err: Error) => {
      if (errorCodeOf(err) === MFA_ALREADY_ENROLLED_ERROR_CODE) {
        toast.error(t('mfaAlreadyEnrolled'), { sticky: true });
        qc.invalidateQueries({ queryKey: statusKey });
      } else {
        toast.error(err.message || t('mfaEnrollFailed'), { sticky: true });
      }
    },
  });

  const enrollVerify = useMutation({
    mutationFn: (code: string) => authService.mfaEnrollVerify(code),
    onSuccess: (res) => {
      setEnrollment(null);
      setRecoveryCodes(res.recoveryCodes);
      toast.success(t('mfaEnrolled'));
      qc.invalidateQueries({ queryKey: statusKey });
    },
    onError: (err: Error) => {
      if (errorCodeOf(err) === MFA_CODE_INVALID_ERROR_CODE) {
        setConfirmError(t('mfaCodeInvalid'));
      } else {
        setConfirmError(err.message || t('mfaCodeInvalid'));
      }
    },
  });

  const disable = useMutation({
    mutationFn: ({ password, code }: { password: string; code: string }) =>
      authService.mfaDisable(password, code),
    onSuccess: () => {
      setDisableOpen(false);
      setDisablePassword('');
      setDisableCode('');
      setDisableError(null);
      toast.success(t('mfaDisabled'));
      qc.invalidateQueries({ queryKey: statusKey });
    },
    onError: (err: Error) => {
      if (errorCodeOf(err) === MFA_CODE_INVALID_ERROR_CODE) {
        setDisableError(t('mfaCodeInvalid'));
      } else {
        setDisableError(err.message || t('mfaDisableFailed'));
      }
    },
  });

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setSecretCopied(true);
    } catch {
      setSecretCopied(false);
    }
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob([recoveryCodes.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shoptalk-mfa-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tc('loading')}
      </div>
    );
  }

  // ---- Step 3: recovery codes (shown once, must be explicitly acknowledged) ----
  if (recoveryCodes) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t('mfaRecoveryWarning')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-5">
          {recoveryCodes.map((code) => (
            <code key={code} className="select-all text-center font-mono text-sm text-gray-900">
              {code}
            </code>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadCodes}>
            <Download className="mr-1.5 h-4 w-4" />
            {t('mfaDownloadCodes')}
          </Button>
          <Button onClick={() => setRecoveryCodes(null)}>
            <Check className="mr-1.5 h-4 w-4" />
            {t('mfaSavedCodes')}
          </Button>
        </div>
      </div>
    );
  }

  // ---- Step 2: pending enrollment — QR + manual key + confirm code ----
  if (enrollment) {
    return (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">{t('mfaScanQr')}</p>
          <div className="flex flex-wrap items-start gap-5">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <QRCodeSVG value={enrollment.otpauthUri} size={160} aria-label={t('mfaQrAlt')} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs text-gray-500">{t('mfaManualKey')}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900">
                  {enrollment.secret}
                </code>
                <Button variant="secondary" size="sm" onClick={copySecret} aria-label={tc('copy')}>
                  {secretCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-1">{secretCopied ? tc('copied') : tc('copy')}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmCode.length === TOTP_LENGTH && !enrollVerify.isPending) {
              enrollVerify.mutate(confirmCode);
            }
          }}
        >
          <FormRow label={t('mfaConfirmCode')}>
            <Input
              type="text"
              value={confirmCode}
              onChange={(e) => {
                setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, TOTP_LENGTH));
                setConfirmError(null);
              }}
              placeholder={t('mfaCodePlaceholder')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={TOTP_LENGTH}
              className="max-w-[12rem] text-center font-mono text-lg tracking-[0.3em]"
            />
          </FormRow>
          {confirmError && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {confirmError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={confirmCode.length !== TOTP_LENGTH || enrollVerify.isPending}
            >
              {enrollVerify.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('mfaConfirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEnrollment(null);
                setConfirmCode('');
                setConfirmError(null);
              }}
            >
              {tc('cancel')}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ---- Step 1: current status ----
  if (status?.enrolled) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-5 w-5 text-green-600" aria-hidden />
            <span className="font-medium text-gray-900">{t('mfaStatusEnabled')}</span>
            <span className="text-gray-500">
              {t('mfaEnabledSince', { date: fmtDate(status.enabledAt) })}
            </span>
          </div>
          <Button variant="danger" onClick={() => setDisableOpen(true)}>
            <ShieldOff className="mr-1.5 h-4 w-4" />
            {t('mfaDisable')}
          </Button>
        </div>

        <Modal
          open={disableOpen}
          onClose={() => setDisableOpen(false)}
          title={t('mfaDisableTitle')}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDisableOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  disable.mutate({ password: disablePassword, code: disableCode.trim() })
                }
                disabled={disable.isPending || !disablePassword || !disableCode.trim()}
              >
                {disable.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('mfaDisable')}
              </Button>
            </>
          }
        >
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{t('mfaDisableWarning')}</p>
          </div>
          <FormRow label={t('password')}>
            <Input
              type="password"
              value={disablePassword}
              onChange={(e) => {
                setDisablePassword(e.target.value);
                setDisableError(null);
              }}
            />
          </FormRow>
          <FormRow label={t('mfaDisableCodeLabel')}>
            <Input
              type="text"
              value={disableCode}
              onChange={(e) => {
                setDisableCode(e.target.value);
                setDisableError(null);
              }}
              placeholder={t('mfaCodePlaceholder')}
              inputMode="text"
              autoComplete="one-time-code"
              className="font-mono"
            />
          </FormRow>
          {disableError && (
            <p role="alert" className="text-sm text-red-600">
              {disableError}
            </p>
          )}
        </Modal>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <ShieldOff className="h-5 w-5 text-gray-400" aria-hidden />
        <span className="font-medium text-gray-700">{t('mfaStatusNotEnrolled')}</span>
      </div>
      <Button onClick={() => enroll.mutate()} disabled={enroll.isPending}>
        {enroll.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        <ShieldCheck className="mr-1.5 h-4 w-4" />
        {t('mfaEnroll')}
      </Button>
    </div>
  );
}
