import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import {
  useEngines,
  useCreateEngine,
  useUpdateEngine,
  useSetEngineEnabled,
} from './admin.hooks';
import type { AiEngine } from './admin.service';

const PROVIDERS = ['openai', 'anthropic', 'google', 'azure'];

export function AiEnginesPage() {
  const { t } = useTranslation('aiEngines');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = useEngines();
  const createEngine = useCreateEngine();
  const updateEngine = useUpdateEngine();
  const setEnabled = useSetEngineEnabled();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [editing, setEditing] = useState<AiEngine | null>(null);
  const [editName, setEditName] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const resetCreate = () => {
    setName('');
    setProvider(PROVIDERS[0]);
    setModel('');
    setApiKey('');
  };

  const handleCreate = () => {
    createEngine.mutate(
      { name, provider, model, apiKey },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetCreate();
        },
      },
    );
  };

  const openEdit = (engine: AiEngine) => {
    setEditing(engine);
    setEditName(engine.name);
    setEditModel(engine.model ?? '');
    setEditApiKey('');
  };

  const handleUpdate = () => {
    if (!editing) return;
    const body: { name?: string; model?: string; apiKey?: string } = {
      name: editName,
      model: editModel,
    };
    if (editApiKey) body.apiKey = editApiKey;
    updateEngine.mutate(
      { id: editing.id, body },
      { onSuccess: () => setEditing(null) },
    );
  };

  const columns: Column<AiEngine>[] = [
    { key: 'name', header: t('name'), render: (r) => r.name },
    {
      key: 'provider',
      header: t('provider'),
      render: (r) => (r.provider ? <Badge tone="primary">{r.provider}</Badge> : '—'),
    },
    { key: 'model', header: t('model'), render: (r) => r.model ?? '—' },
    {
      key: 'enabled',
      header: t('status'),
      render: (r) => <StatusBadge status={r.enabled ? 'enabled' : 'disabled'} />,
    },
    { key: 'maskedApiKey', header: t('apiKey'), render: (r) => r.maskedApiKey ?? '••••' },
    { key: 'createdAt', header: t('created'), render: (r) => r.createdAt ?? '—' },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>
            {tc('edit')}
          </Button>
          <Button
            variant={r.enabled ? 'danger' : 'secondary'}
            size="sm"
            disabled={setEnabled.isPending}
            onClick={() => setEnabled.mutate({ id: r.id, enabled: !r.enabled })}
          >
            {r.enabled ? t('disable') : t('enable')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={<Button onClick={() => setCreateOpen(true)}>{t('addEngine')}</Button>}
      />

      <Table
        columns={columns}
        data={data}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        rowKey={(r) => r.id}
        emptyMessage={t('empty')}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('addEngine')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createEngine.isPending || !name || !model || !apiKey}
            >
              {tc('create')}
            </Button>
          </>
        }
      >
        <FormRow label={t('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label={t('provider')}>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label={t('model')}>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </FormRow>
        <FormRow label={t('apiKey')}>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </FormRow>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t('editEngine')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={updateEngine.isPending || !editName}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('name')}>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
        </FormRow>
        <FormRow label={t('model')}>
          <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} />
        </FormRow>
        <FormRow label={t('apiKeyEdit')}>
          <Input
            type="password"
            value={editApiKey}
            onChange={(e) => setEditApiKey(e.target.value)}
            autoComplete="off"
          />
        </FormRow>
      </Modal>
    </div>
  );
}
