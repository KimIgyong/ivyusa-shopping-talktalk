import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
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
    { key: 'provider', header: t('provider'), render: (c) => c.provider },
    {
      key: 'configured',
      header: t('status'),
      render: (c) =>
        c.configured ? <Badge tone="success">{t('connected')}</Badge> : <Badge>{t('notSet')}</Badge>,
    },
    {
      key: 'maskedKey',
      header: t('key'),
      render: (c) => <span className="font-mono text-xs">{c.maskedKey || '—'}</span>,
    },
    { key: 'lastUpdatedAt', header: t('lastUpdated'), render: (c) => fmtDate(c.lastUpdatedAt) },
    {
      key: 'action',
      header: '',
      render: (c) => (
        <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
          {tc('update')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card title={t('integrationCredentials')}>
        <Table<CredentialStatus>
          columns={columns}
          data={data}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage={t('empty')}
          rowKey={(c) => c.provider}
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t('updateProvider', { provider: editing.provider }) : t('updateCredential')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {tc('cancel')}
            </Button>
            <Button onClick={onSave} disabled={updateCredential.isPending}>
              {updateCredential.isPending ? tc('saving') : tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('apiKey')}>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('apiKeyPlaceholder')}
            autoComplete="off"
          />
        </FormRow>
        <FormRow label={t('secretOptional')}>
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={t('secretPlaceholder')}
            autoComplete="off"
          />
        </FormRow>
      </Modal>
    </div>
  );
}
