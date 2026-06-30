import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select, Label } from '@/components/Field';
import { Table, type Column } from '@/components/Table';
import { cn } from '@/lib/cn';
import {
  useAiSettings,
  useUpdateAiSetting,
  useModerationRules,
  useCreateRule,
  useDeleteRule,
  useAiConfig,
  useUpdateAiConfig,
} from './ai-settings.hooks';
import type {
  AiFunctionSetting,
  ModerationRule,
  ScenarioButton,
} from './ai-settings.service';

const FUNCTION_KEYS = new Set(['chat', 'rag', 'summary', 'assist', 'moderation']);

const SCENARIO_ACTIONS = [
  'delivery_status',
  'cancel_refund',
  'product_help',
  'contact_support',
  'affiliate',
  'my_orders',
  'message',
] as const;

export function AiSettingsPage() {
  const { t } = useTranslation('aiSetting');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <PersonaSection />
      <ResponseRulesSection />
      <ScenarioButtonsSection />
      <AiFunctionsSection />
      <ModerationSection />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* a. Bot persona                                                             */
/* -------------------------------------------------------------------------- */

function PersonaSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: config, isLoading, error } = useAiConfig();
  const updateConfig = useUpdateAiConfig();
  const [persona, setPersona] = useState('');

  useEffect(() => {
    if (config) setPersona(config.persona ?? '');
  }, [config]);

  return (
    <Card title={t('persona')}>
      {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
      {!isLoading && error && (
        <p className="text-sm text-error">{error instanceof Error ? error.message : tc('empty')}</p>
      )}
      {!isLoading && !error && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{t('personaHint')}</p>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={updateConfig.isPending}
              onClick={() => updateConfig.mutate({ persona })}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* b. Response rules                                                          */
/* -------------------------------------------------------------------------- */

function ResponseRulesSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: config, isLoading, error } = useAiConfig();
  const updateConfig = useUpdateAiConfig();
  const [rules, setRules] = useState<string[]>([]);

  useEffect(() => {
    if (config) setRules(config.rules ?? []);
  }, [config]);

  const setRuleAt = (i: number, value: string) =>
    setRules((prev) => prev.map((r, idx) => (idx === i ? value : r)));
  const removeRuleAt = (i: number) => setRules((prev) => prev.filter((_, idx) => idx !== i));
  const addRule = () => setRules((prev) => [...prev, '']);

  const save = () =>
    updateConfig.mutate({ rules: rules.map((r) => r.trim()).filter((r) => r.length > 0) });

  return (
    <Card
      title={t('responseRules')}
      action={
        <Button size="sm" variant="secondary" onClick={addRule} disabled={isLoading || !!error}>
          <Plus className="h-4 w-4" /> {t('addRule')}
        </Button>
      }
    >
      {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
      {!isLoading && error && (
        <p className="text-sm text-error">{error instanceof Error ? error.message : tc('empty')}</p>
      )}
      {!isLoading && !error && (
        <div className="space-y-3">
          {rules.length === 0 && <p className="text-sm text-gray-400">{t('noRules')}</p>}
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={rule}
                onChange={(e) => setRuleAt(i, e.target.value)}
                placeholder={t('rulePlaceholder')}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('remove')}
                onClick={() => removeRuleAt(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex justify-end">
            <Button size="sm" disabled={updateConfig.isPending} onClick={save}>
              {t('save')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* c. Scenario buttons                                                        */
/* -------------------------------------------------------------------------- */

function ScenarioButtonsSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: config, isLoading, error } = useAiConfig();
  const updateConfig = useUpdateAiConfig();
  const [buttons, setButtons] = useState<ScenarioButton[]>([]);

  useEffect(() => {
    if (config) setButtons(config.scenarioButtons ?? []);
  }, [config]);

  const patch = (i: number, partial: Partial<ScenarioButton>) =>
    setButtons((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...partial } : b)));
  const removeAt = (i: number) => setButtons((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setButtons((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () =>
    setButtons((prev) => [
      ...prev,
      {
        id: `btn_${Date.now()}_${prev.length}`,
        label: '',
        action: SCENARIO_ACTIONS[0],
        enabled: true,
      },
    ]);

  const save = () =>
    updateConfig.mutate({
      scenario_buttons: buttons.filter((b) => b.label.trim().length > 0),
    });

  return (
    <Card
      title={t('scenarioButtons')}
      action={
        <Button size="sm" variant="secondary" onClick={add} disabled={isLoading || !!error}>
          <Plus className="h-4 w-4" /> {t('addButton')}
        </Button>
      }
    >
      {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
      {!isLoading && error && (
        <p className="text-sm text-error">{error instanceof Error ? error.message : tc('empty')}</p>
      )}
      {!isLoading && !error && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{t('scenarioHint')}</p>
          {buttons.length === 0 && <p className="text-sm text-gray-400">{t('noFunctions')}</p>}
          {buttons.map((btn, i) => (
            <div
              key={btn.id}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 p-3"
            >
              <div className="min-w-[160px] flex-1">
                <Label>{t('label')}</Label>
                <Input value={btn.label} onChange={(e) => patch(i, { label: e.target.value })} />
              </div>
              <div className="min-w-[180px] flex-1">
                <Label>{t('action')}</Label>
                <Select value={btn.action} onChange={(e) => patch(i, { action: e.target.value })}>
                  {SCENARIO_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {t(`action_${a}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={btn.enabled}
                  onChange={(e) => patch(i, { enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                {t('enabled')}
              </label>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('moveUp')}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('moveDown')}
                  disabled={i === buttons.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('remove')}
                  onClick={() => removeAt(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button size="sm" disabled={updateConfig.isPending} onClick={save}>
              {t('save')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* d. AI functions (engine + params)                                          */
/* -------------------------------------------------------------------------- */

function AiFunctionsSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: settings, isLoading, error } = useAiSettings();
  const update = useUpdateAiSetting();

  return (
    <Card title={t('aiFunctions')}>
      {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
      {!isLoading && error && (
        <p className="text-sm text-error">{error instanceof Error ? error.message : tc('empty')}</p>
      )}
      {!isLoading && !error && (!settings || settings.length === 0) && (
        <p className="text-sm text-gray-400">{t('noFunctions')}</p>
      )}
      <div className="divide-y divide-gray-100">
        {settings?.map((s) => (
          <FunctionRow
            key={s.function}
            setting={s}
            onSave={(engineId, params) =>
              update.mutate({ fn: s.function, engineId, params })
            }
            saving={update.isPending}
          />
        ))}
      </div>
    </Card>
  );
}

function asNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function FunctionRow({
  setting,
  onSave,
  saving,
}: {
  setting: AiFunctionSetting;
  onSave: (engineId: string, params: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const { t } = useTranslation('aiSetting');
  const label = FUNCTION_KEYS.has(setting.function)
    ? t(`functions.${setting.function}`)
    : setting.function;

  const [engineId, setEngineId] = useState(setting.engineId ?? '');
  const [temperature, setTemperature] = useState(asNumber(setting.params?.temperature));
  const [maxTokens, setMaxTokens] = useState(asNumber(setting.params?.max_tokens));

  useEffect(() => {
    setEngineId(setting.engineId ?? '');
    setTemperature(asNumber(setting.params?.temperature));
    setMaxTokens(asNumber(setting.params?.max_tokens));
  }, [setting]);

  const save = () => {
    const params: Record<string, unknown> = {};
    if (temperature.trim() !== '') params.temperature = Number(temperature);
    if (maxTokens.trim() !== '') params.max_tokens = Number(maxTokens);
    onSave(engineId, params);
  };

  return (
    <div className="space-y-3 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">
            {t('enginesAvailable', { count: setting.availableEngines.length })}
          </p>
        </div>
        <div className="w-64">
          <Label>{t('selectEngine')}</Label>
          <Select value={engineId} disabled={saving} onChange={(e) => setEngineId(e.target.value)}>
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
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Label>{t('temperature')}</Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={1}
            value={temperature}
            disabled={saving}
            onChange={(e) => setTemperature(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Label>{t('maxTokens')}</Label>
          <Input
            type="number"
            step={1}
            min={0}
            value={maxTokens}
            disabled={saving}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
        </div>
        <Button size="sm" disabled={saving || !engineId} onClick={save} className={cn('ml-auto')}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* e. Moderation rules (unchanged behaviour)                                  */
/* -------------------------------------------------------------------------- */

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
