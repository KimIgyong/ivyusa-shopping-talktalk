import { useState } from 'react';
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
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const clearMustChange = useAuthStore((s) => s.clearMustChange);

  const submit = async () => {
    if (next !== confirm) {
      toast.error('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword(current, next);
      clearMustChange();
      toast.success('Password changed.');
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={forced ? undefined : onClose}
      title={forced ? 'You must change your password' : 'Change password'}
      footer={
        <>
          {!forced && (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={submit} disabled={loading || !current || !next}>
            {loading ? 'Saving…' : 'Update password'}
          </Button>
        </>
      }
    >
      {forced && (
        <p className="mb-4 text-sm text-gray-500">
          A password change is required before you continue.
        </p>
      )}
      <FormRow label="Current password">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </FormRow>
      <FormRow label="New password">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </FormRow>
      <FormRow label="Confirm new password">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormRow>
    </Modal>
  );
}
