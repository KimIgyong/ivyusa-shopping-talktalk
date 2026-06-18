import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { FormRow, Input } from '@/components/Field';
import { useCredentials, useUpdateCredential } from './settings.hooks';
import type { CredentialStatus } from './settings.service';

function fmtDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function SettingsPage() {
  const { data, isLoading, error } = useCredentials();
  const updateCredential = useUpdateCredential();

  const [editing, setEditing] = useState<CredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');

  const openEdit = (c: CredentialStatus) => {
    setEditing(c);
    setApiKey('');
    setSecret('');
  };

  const onSave = async () => {
    if (!editing) return;
    await updateCredential.mutateAsync({
      provider: editing.provider,
      body: { apiKey, secret },
    });
    setEditing(null);
  };

  const columns: Column<CredentialStatus>[] = [
    { key: 'provider', header: 'Provider', render: (c) => c.provider },
    {
      key: 'configured',
      header: 'Status',
      render: (c) =>
        c.configured ? <Badge tone="success">Connected</Badge> : <Badge>Not set</Badge>,
    },
    {
      key: 'maskedKey',
      header: 'Key',
      render: (c) => <span className="font-mono text-xs">{c.maskedKey || '—'}</span>,
    },
    { key: 'lastUpdatedAt', header: 'Last updated', render: (c) => fmtDate(c.lastUpdatedAt) },
    {
      key: 'action',
      header: '',
      render: (c) => (
        <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
          Update
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Tenant Settings" subtitle="Manage integrations and credentials." />

      <Card title="Integration credentials">
        <Table<CredentialStatus>
          columns={columns}
          data={data}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="No integrations available."
          rowKey={(c) => c.provider}
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Update ${editing.provider}` : 'Update credential'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={updateCredential.isPending}>
              {updateCredential.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <FormRow label="API key">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key"
            autoComplete="off"
          />
        </FormRow>
        <FormRow label="Secret (optional)">
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter secret"
            autoComplete="off"
          />
        </FormRow>
      </Modal>
    </div>
  );
}
