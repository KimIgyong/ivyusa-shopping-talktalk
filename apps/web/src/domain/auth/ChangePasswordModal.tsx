import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormRow } from '@/components/Field';
import { authService } from './auth.service';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';
import { PASSWORD_POLICY_ERROR_CODE, validatePasswordClient } from './password-policy';
// Shared with the login-page recovery panel (PLN-260824 S3).
import { PasswordField, RULE_LABEL_KEY, RULE_ORDER } from './PasswordField';

interface Props {
  open: boolean;
  forced?: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, forced, onClose }: Props) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  // Instant, per-rule mirror of the server's context-free policy rules.
  const policy = validatePasswordClient(next);

  const submit = async () => {
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
      // Adopt the rotated tokens — the old access token is rejected outside
      // the change-password flow once the must-change lockout was active.
      const tokens = await authService.changePassword(current, next);
      setAuth(tokens);
      toast.success(t('passwordChanged'));
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (e) {
      // E1009 — server-side policy rejection (covers the context rules the
      // client cannot check: identity containment, same-as-current).
      const code = (e as Error & { code?: string }).code;
      if (code === PASSWORD_POLICY_ERROR_CODE) {
        toast.error(t('passwordPolicyFailed'));
      } else {
        toast.error(e instanceof Error ? e.message : t('changePasswordFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={forced ? undefined : onClose}
      title={forced ? t('mustChangeTitle') : t('changePassword')}
      footer={
        <>
          {!forced && (
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
          )}
          <Button onClick={submit} disabled={loading || !current || !next || !policy.ok}>
            {loading ? tc('saving') : t('updatePassword')}
          </Button>
        </>
      }
    >
      {forced && <p className="mb-4 text-sm text-gray-500">{t('mustChangeNotice')}</p>}
      <FormRow label={forced ? t('currentOrTempPassword') : t('currentPassword')}>
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
    </Modal>
  );
}
