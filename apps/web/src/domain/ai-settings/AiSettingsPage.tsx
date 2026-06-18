import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

const FUNCTION_KEYS = new Set(['chat', 'rag', 'summary', 'assist', 'moderation']);

export function AiSettingsPage() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: settings, isLoading } = useAiSettings();
  const update = useUpdateAiSetting();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card title={t('aiFunctions')}>
        {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
        {!isLoading && (!settings || settings.length === 0) && (
          <p className="text-sm text-gray-400">{t('noFunctions')}</p>
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
  const { t } = useTranslation('aiSetting');
  const label = FUNCTION_KEYS.has(setting.function)
    ? t(`functions.${setting.function}`)
    : setting.function;
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">
          {t('enginesAvailable', { count: setting.availableEngines.length })}
        </p>
      </div>
      <div className="w-64">
        <Select
          value={setting.engineId ?? ''}
          disabled={saving}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="" disabled>
            {t('selectEngine')}
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
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
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
    { key: 'pattern', header: t('pattern'), render: (r) => <span className="font-mono text-xs">{r.pattern}</span> },
    {
      key: 'action',
      header: t('action'),
      render: (r) => (
        <Badge tone={r.action === 'block' ? 'error' : r.action === 'flag' ? 'warning' : 'gray'}>
          {r.action}
        </Badge>
      ),
    },
    { key: 'description', header: t('description'), render: (r) => r.description ?? '—' },
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
            if (window.confirm(t('deleteRuleConfirm'))) deleteRule.mutate(r.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={t('moderationRules')}
      action={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {t('addRule')}
        </Button>
      }
    >
      <Table
        columns={columns}
        data={rules}
        loading={isLoading}
        error={error instanceof Error ? error.message : null}
        emptyMessage={t('noRules')}
        rowKey={(r) => r.id}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('addModerationRule')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={submit} disabled={createRule.isPending || !pattern.trim()}>
              {t('addRule')}
            </Button>
          </>
        }
      >
        <FormRow label={t('patternLabel')}>
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. \\bbadword\\b" />
        </FormRow>
        <FormRow label={t('action')}>
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="block">{t('block')}</option>
            <option value="flag">{t('flag')}</option>
            <option value="warn">{t('warn')}</option>
          </Select>
        </FormRow>
        <FormRow label={t('descriptionOptional')}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
      </Modal>
    </Card>
  );
}
