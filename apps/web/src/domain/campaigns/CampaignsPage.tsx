import { useState } from 'react';
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
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'channel', header: 'Channel', render: (r) => r.channel ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'audienceSize',
      header: 'Audience',
      render: (r) => (r.audienceSize ?? 0).toLocaleString(),
    },
    { key: 'sentCount', header: 'Sent', render: (r) => (r.sentCount ?? 0).toLocaleString() },
    {
      key: 'createdAt',
      header: 'Created',
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
          Send
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Create and send outbound campaigns"
        action={<Button onClick={() => setOpen(true)}>New campaign</Button>}
      />

      <Table<Campaign>
        columns={columns}
        data={data}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="No campaigns yet."
        rowKey={(r) => r.id}
      />

      <Modal
        open={open}
        onClose={close}
        title="New campaign"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={createCampaign.isPending || !name || !message}
            >
              Save
            </Button>
          </>
        }
      >
        <FormRow label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">email</option>
            <option value="sms">sms</option>
            <option value="kakao">kakao</option>
          </Select>
        </FormRow>
        <FormRow label="Message">
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
