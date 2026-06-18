import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { useCampaigns, useCreateCampaign, useSendCampaign } from './campaigns.hooks';
import type { Campaign } from './campaigns.service';

export function CampaignsPage() {
  const { t } = useTranslation('campaigns');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = useCampaigns();
  const createCampaign = useCreateCampaign();
  const sendCampaign = useSendCampaign();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');
  const [message, setMessage] = useState('');

  const close = () => {
    setOpen(false);
    setName('');
    setChannel('email');
    setMessage('');
  };

  const save = () => {
    createCampaign.mutate(
      { name, channel, message },
      { onSuccess: close },
    );
  };

  const columns: Column<Campaign>[] = [
    { key: 'name', header: t('name'), render: (r) => r.name },
    { key: 'channel', header: t('channel'), render: (r) => r.channel ?? '—' },
    { key: 'status', header: t('status'), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'audienceSize',
      header: t('audience'),
      render: (r) => (r.audienceSize ?? 0).toLocaleString(),
    },
    { key: 'sentCount', header: t('sent'), render: (r) => (r.sentCount ?? 0).toLocaleString() },
    {
      key: 'createdAt',
      header: t('created'),
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          disabled={sendCampaign.isPending}
          onClick={() => sendCampaign.mutate(r.id)}
        >
          {t('send')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={<Button onClick={() => setOpen(true)}>{t('newCampaign')}</Button>}
      />

      <Table<Campaign>
        columns={columns}
        data={data}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(r) => r.id}
      />

      <Modal
        open={open}
        onClose={close}
        title={t('newCampaign')}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={save}
              disabled={createCampaign.isPending || !name || !message}
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label={t('channel')}>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">email</option>
            <option value="sms">sms</option>
            <option value="kakao">kakao</option>
          </Select>
        </FormRow>
        <FormRow label={t('message')}>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </FormRow>
      </Modal>
    </div>
  );
}
