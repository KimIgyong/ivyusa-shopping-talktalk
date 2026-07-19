import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { authService } from './auth.service';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';

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

  const submit = async () => {
    if (next !== confirm) {
      toast.error(t('passwordsDoNotMatch'));
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
      toast.error(e instanceof Error ? e.message : t('changePasswordFailed'));
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
          <Button onClick={submit} disabled={loading || !current || !next}>
            {loading ? tc('saving') : t('updatePassword')}
          </Button>
        </>
      }
    >
      {forced && <p className="mb-4 text-sm text-gray-500">{t('mustChangeNotice')}</p>}
      <FormRow label={t('currentPassword')}>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </FormRow>
      <FormRow label={t('newPassword')}>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </FormRow>
      <FormRow label={t('confirmPassword')}>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormRow>
    </Modal>
  );
}
