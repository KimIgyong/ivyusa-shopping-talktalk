import { useState } from 'react';
import { Check, Copy, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { Table, type Column } from '@/components/Table';
import { FormRow, Input, Select } from '@/components/Field';
import { useAuthStore } from '@/store/auth-store';
import {
  useAdminAccounts,
  useInviteAdmin,
  useIssueAdminTempPassword,
  useSetAdminStatus,
} from './admin.hooks';
import type { AdminAccount, AdminCredential } from './admin.service';

/**
 * Platform-admin accounts (REQ-260824-Admin-Account-Invite). Super-admin only:
 * the server gates every route, the sidebar hides the menu from admin-level
 * operators, and this page shows a notice instead of a broken table when
 * someone lands here by URL.
 */
export function AdminUsersPage() {
  const { t } = useTranslation('adminUsers');
  const principal = useAuthStore((s) => s.principal);
  const isSuper = principal?.level === 'super_admin';

  const { data: admins, isLoading, error } = useAdminAccounts();
  const invite = useInviteAdmin();
  const issueTempPw = useIssueAdminTempPassword();
  const setStatus = useSetAdminStatus();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [level, setLevel] = useState<'super_admin' | 'admin'>('admin');
  const [sendEmail, setSendEmail] = useState(true);

  // One-time credential reveal — closing it is the last chance to copy.
  const [credential, setCredential] = useState<AdminCredential | null>(null);
  const [copied, setCopied] = useState(false);
  const [tempPwTarget, setTempPwTarget] = useState<AdminAccount | null>(null);
  const [tempPwSendEmail, setTempPwSendEmail] = useState(true);
  const [statusTarget, setStatusTarget] = useState<AdminAccount | null>(null);

  if (!isSuper) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          {t('superOnly')}
        </p>
      </div>
    );
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard unavailable — the value stays selectable */
    }
  };

  const onInvite = async () => {
    const res = await invite.mutateAsync({ email: email.trim(), level, sendEmail });
    setInviteOpen(false);
    setCopied(false);
    setCredential(res);
  };

  const confirmIssueTempPw = async () => {
    if (!tempPwTarget) return;
    const res = await issueTempPw.mutateAsync({
      adminId: tempPwTarget.id,
      sendEmail: tempPwSendEmail,
    });
    setTempPwTarget(null);
    setCopied(false);
    setCredential(res);
  };

  const columns: Column<AdminAccount>[] = [
    { key: 'email', header: t('email'), render: (a) => <span className="text-sm">{a.email}</span> },
    {
      key: 'level',
      header: t('level'),
      render: (a) => (
        <Badge tone={a.level === 'super_admin' ? 'primary' : 'gray'}>
          {t(`levels.${a.level}`, { defaultValue: a.level })}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (a) => (
        <span className="inline-flex items-center gap-1">
          <StatusBadge status={a.status} label={t(`statuses.${a.status}`, { defaultValue: a.status })} />
          {a.mustChangePassword && <Badge tone="warning">{t('mustChangePw')}</Badge>}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: t('createdAt'),
      render: (a) => (
        <span className="text-xs text-gray-500">
          {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (a) => {
        const self = String(a.id) === String(principal?.id ?? '');
        return (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="secondary" onClick={() => { setTempPwSendEmail(true); setTempPwTarget(a); }}>
              {t('tempPw')}
            </Button>
            {!self && (
              <Button
                size="sm"
                variant={a.status === 'active' ? 'ghost' : 'secondary'}
                onClick={() => setStatusTarget(a)}
              >
                {a.status === 'active' ? t('deactivate') : t('activate')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          <Button onClick={() => { setEmail(''); setLevel('admin'); setSendEmail(true); setInviteOpen(true); }}>
            <UserPlus className="mr-1 h-4 w-4" /> {t('invite')}
          </Button>
        }
      />

      <Table<AdminAccount>
        columns={columns}
        data={admins}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(a) => a.id}
      />

      {/* Invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('inviteTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button disabled={!email.trim() || invite.isPending} onClick={() => void onInvite()}>
              {t('invite')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormRow label={t('email')}>
            <Input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@amoeba.group"
            />
          </FormRow>
          <FormRow label={t('level')}>
            <Select value={level} onChange={(e) => setLevel(e.target.value as 'super_admin' | 'admin')}>
              <option value="admin">{t('levels.admin')}</option>
              <option value="super_admin">{t('levels.super_admin')}</option>
            </Select>
          </FormRow>
          <p className="text-xs text-gray-500">{t(`levelHint.${level}`)}</p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            {t('sendEmail')}
          </label>
        </div>
      </Modal>

      {/* Temp-password confirm */}
      <Modal
        open={!!tempPwTarget}
        onClose={() => setTempPwTarget(null)}
        title={t('tempPwTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTempPwTarget(null)}>
              {t('cancel')}
            </Button>
            <Button disabled={issueTempPw.isPending} onClick={() => void confirmIssueTempPw()}>
              {t('tempPwConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t('tempPwBody', { email: tempPwTarget?.email })}</p>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={tempPwSendEmail}
            onChange={(e) => setTempPwSendEmail(e.target.checked)}
          />
          {t('sendEmail')}
        </label>
      </Modal>

      {/* One-time credential reveal */}
      <Modal
        open={!!credential}
        onClose={() => setCredential(null)}
        title={t('credentialTitle')}
        size="sm"
        footer={<Button onClick={() => setCredential(null)}>{t('close')}</Button>}
      >
        {credential && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">{credential.email}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm">
                {credential.tempPassword}
              </code>
              <Button size="sm" variant="secondary" onClick={() => void copyText(credential.tempPassword)}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {credential.emailSent != null && (
              <p className="text-xs text-gray-500">
                {credential.emailSent ? t('emailSentYes') : t('emailSentNo')}
              </p>
            )}
            <p className="text-xs text-amber-600">{t('credentialOnce')}</p>
            <p className="text-xs text-gray-400">{t('loginHint')}</p>
          </div>
        )}
      </Modal>

      {/* Status change confirm */}
      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={statusTarget?.status === 'active' ? t('deactivateTitle') : t('activateTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant={statusTarget?.status === 'active' ? 'danger' : 'primary'}
              disabled={setStatus.isPending}
              onClick={() => {
                if (!statusTarget) return;
                setStatus.mutate(
                  {
                    adminId: statusTarget.id,
                    status: statusTarget.status === 'active' ? 'suspended' : 'active',
                  },
                  { onSettled: () => setStatusTarget(null) },
                );
              }}
            >
              {statusTarget?.status === 'active' ? t('deactivate') : t('activate')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          {statusTarget?.status === 'active'
            ? t('deactivateBody', { email: statusTarget?.email })
            : t('activateBody', { email: statusTarget?.email })}
        </p>
      </Modal>
    </div>
  );
}
