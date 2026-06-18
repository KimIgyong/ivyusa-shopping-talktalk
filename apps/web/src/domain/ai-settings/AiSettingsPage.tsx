import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { Table, type Column } from '@/components/Table';
import {
  useAiSettings,
  useUpdateAiSetting,
  useModerationRules,
  useCreateRule,
  useDeleteRule,
} from './ai-settings.hooks';
import type { AiFunctionSetting, ModerationRule } from './ai-settings.service';

const FUNCTION_LABELS: Record<string, string> = {
  chat: 'Chat',
  rag: 'RAG / Retrieval',
  summary: 'Summarization',
  assist: 'Agent Assist',
  moderation: 'Moderation',
};

export function AiSettingsPage() {
  const { data: settings, isLoading } = useAiSettings();
  const update = useUpdateAiSetting();

  return (
    <div className="space-y-6">
      <PageHeader title="AI Settings" subtitle="Configure the engine powering each AI function" />

      <Card title="AI functions">
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!isLoading && (!settings || settings.length === 0) && (
          <p className="text-sm text-gray-400">No AI functions configured.</p>
        )}
        <div className="divide-y divide-gray-100">
          {settings?.map((s) => (
            <FunctionRow
              key={s.function}
              setting={s}
              onSelect={(engineId) => update.mutate({ fn: s.function, engineId })}
              saving={update.isPending}
            />
          ))}
        </div>
      </Card>

      <ModerationSection />
    </div>
  );
}

function FunctionRow({
  setting,
  onSelect,
  saving,
}: {
  setting: AiFunctionSetting;
  onSelect: (engineId: string) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="text-sm font-medium text-gray-800">
          {FUNCTION_LABELS[setting.function] ?? setting.function}
        </p>
        <p className="text-xs text-gray-400">
          {setting.availableEngines.length} engine(s) available
        </p>
      </div>
      <div className="w-64">
        <Select
          value={setting.engineId ?? ''}
          disabled={saving}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>
            Select engine…
          </option>
          {setting.availableEngines.map((eng) => (
            <option key={eng.id} value={eng.id}>
              {eng.name}
              {eng.model ? ` (${eng.model})` : ''}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function ModerationSection() {
  const { data: rules, isLoading, error } = useModerationRules();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState('');
  const [action, setAction] = useState('block');
  const [description, setDescription] = useState('');

  const submit = async () => {
    if (!pattern.trim()) return;
    await createRule.mutateAsync({ pattern, action, description: description || undefined });
    setPattern('');
    setDescription('');
    setAction('block');
    setOpen(false);
  };

  const columns: Column<ModerationRule>[] = [
    { key: 'pattern', header: 'Pattern', render: (r) => <span className="font-mono text-xs">{r.pattern}</span> },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <Badge tone={r.action === 'block' ? 'error' : r.action === 'flag' ? 'warning' : 'gray'}>
          {r.action}
        </Badge>
      ),
    },
    { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button
          variant="danger"
          size="sm"
          disabled={deleteRule.isPending}
          onClick={() => {
            if (window.confirm('Delete this moderation rule?')) deleteRule.mutate(r.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="Moderation rules"
      action={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add rule
        </Button>
      }
    >
      <Table
        columns={columns}
        data={rules}
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        emptyMessage="No moderation rules."
        rowKey={(r) => r.id}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add moderation rule"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createRule.isPending || !pattern.trim()}>
              Add rule
            </Button>
          </>
        }
      >
        <FormRow label="Pattern (keyword or regex)">
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. \\bbadword\\b" />
        </FormRow>
        <FormRow label="Action">
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="block">Block</option>
            <option value="flag">Flag</option>
            <option value="warn">Warn</option>
          </Select>
        </FormRow>
        <FormRow label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
      </Modal>
    </Card>
  );
}
