import { useState } from 'react';
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
    { key: 'name', header: 'Name', render: (r) => r.name },
    {
      key: 'provider',
      header: 'Provider',
      render: (r) => (r.provider ? <Badge tone="primary">{r.provider}</Badge> : '—'),
    },
    { key: 'model', header: 'Model', render: (r) => r.model ?? '—' },
    {
      key: 'enabled',
      header: 'Status',
      render: (r) => <StatusBadge status={r.enabled ? 'enabled' : 'disabled'} />,
    },
    { key: 'maskedApiKey', header: 'API key', render: (r) => r.maskedApiKey ?? '••••' },
    { key: 'createdAt', header: 'Created', render: (r) => r.createdAt ?? '—' },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Button
            variant={r.enabled ? 'danger' : 'secondary'}
            size="sm"
            disabled={setEnabled.isPending}
            onClick={() => setEnabled.mutate({ id: r.id, enabled: !r.enabled })}
          >
            {r.enabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="AI Engines"
        action={<Button onClick={() => setCreateOpen(true)}>Add engine</Button>}
      />

      <Table
        columns={columns}
        data={data}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        rowKey={(r) => r.id}
        emptyMessage="No engines configured."
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add engine"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createEngine.isPending || !name || !model || !apiKey}
            >
              Create
            </Button>
          </>
        }
      >
        <FormRow label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label="Provider">
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Model">
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </FormRow>
        <FormRow label="API key">
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
        title="Edit engine"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateEngine.isPending || !editName}>
              Save
            </Button>
          </>
        }
      >
        <FormRow label="Name">
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
        </FormRow>
        <FormRow label="Model">
          <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} />
        </FormRow>
        <FormRow label="API key (leave blank to keep current)">
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
