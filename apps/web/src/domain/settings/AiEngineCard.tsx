import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { Lock } from 'lucide-react';
import {
  useAiEngines,
  useDeleteAiEngine,
  useSaveAiEngine,
  useSetAiEngineDefault,
  useTestAiEngine,
} from './settings.hooks';
import type { EngineTestResult, TenantAiEngine } from './settings.service';

/**
 * The tenant's own AI engines (PLN-260824).
 *
 * Routing already preferred a tenant's engine over the platform's — there was
 * simply no way for a tenant to have one, which is why every tenant on staging
 * ran the same model. Platform engines are listed beside them, read-only, so
 * the operator can see what they fall back to and that their own engine wins.
 */
export function AiEngineCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const engines = useAiEngines();
  const save = useSaveAiEngine();
  const setDefault = useSetAiEngineDefault();
  const test = useTestAiEngine();
  const remove = useDeleteAiEngine();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TenantAiEngine | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState<EngineTestResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setProvider(editing?.provider ?? (engines.data?.providers[0] ?? 'anthropic'));
    setModel(editing?.model ?? '');
    setEndpoint(editing?.endpoint ?? '');
    setApiKey('');
    setResult(null);
  }, [open, editing, engines.data?.providers]);

  const row = (e: TenantAiEngine, platform: boolean) => (
    <li key={e.id} className="flex items-center gap-2 border-b border-gray-100 py-2 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {platform ? <Lock className="mr-1 inline h-3 w-3 text-gray-400" /> : null}
          {e.name}
        </span>
        <span className="ml-2 text-xs text-gray-500">
          {e.provider} / {e.model}
        </span>
        {!platform && !e.hasApiKey ? (
          // An enabled engine with no key cannot answer, and the gateway would
          // fall through to the stub silently. Say so where it is fixed.
          <span className="ml-2 text-xs text-amber-700">{t('aiEngines.noKey')}</span>
        ) : null}
      </span>
      {e.isDefault ? <Badge tone="primary">{t('aiEngines.default')}</Badge> : null}
      {e.status !== 'enabled' ? <Badge tone="warning">{t('aiEngines.disabled')}</Badge> : null}
      {!platform ? (
        <>
          {!e.isDefault && e.status === 'enabled' ? (
            <Button size="sm" variant="secondary" onClick={() => setDefault.mutate(e.id)}>
              {t('aiEngines.makeDefault')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate(e.id, { onSuccess: (r) => setResult(r) })}
          >
            {t('aiEngines.test')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(e);
              setOpen(true);
            }}
          >
            {tc('edit')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => remove.mutate(e.id)}>
            {tc('delete')}
          </Button>
        </>
      ) : null}
    </li>
  );

  const testLine = (r: EngineTestResult) =>
    r.ok
      ? t('aiEngines.testOk', { ms: r.elapsedMs })
      : t(`aiEngines.testFail.${r.reason}` as const);

  return (
    <Card
      title={t('aiEngines.title')}
      action={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          {t('aiEngines.add')}
        </Button>
      }
    >
      <p className="mb-3 text-xs text-gray-500">{t('aiEngines.hint')}</p>

      {engines.isLoading ? <p className="text-sm text-gray-500">{tc('loading')}</p> : null}
      {engines.error ? (
        <p className="text-sm text-red-600">{(engines.error as Error).message}</p>
      ) : null}

      {engines.data?.own.length ? (
        <>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
            {t('aiEngines.mine')}
          </h4>
          <ul className="mb-4 text-sm">{engines.data.own.map((e) => row(e, false))}</ul>
        </>
      ) : (
        <p className="mb-4 text-sm text-gray-500">{t('aiEngines.empty')}</p>
      )}

      {engines.data?.platform.length ? (
        <>
          <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
            {t('aiEngines.platform')}
          </h4>
          <ul className="text-sm">{engines.data.platform.map((e) => row(e, true))}</ul>
          <p className="mt-2 text-xs text-gray-500">{t('aiEngines.platformHint')}</p>
        </>
      ) : null}

      {result ? (
        <p className={`mt-3 text-xs ${result.ok ? 'text-green-700' : 'text-amber-700'}`}>
          {testLine(result)}
          {result.detail ? <span className="ml-1 text-gray-500">({result.detail})</span> : null}
        </p>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('aiEngines.edit') : t('aiEngines.add')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              disabled={!name.trim() || !model.trim() || save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    id: editing?.id,
                    name: name.trim(),
                    provider,
                    model: model.trim(),
                    endpoint: endpoint.trim() || undefined,
                    // Sent only when typed: an empty box means "keep the stored
                    // key", since the form can never show it.
                    ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
                  },
                  { onSuccess: () => setOpen(false) },
                )
              }
            >
              {save.isPending ? tc('loading') : tc('save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormRow label={t('aiEngines.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </FormRow>
          <FormRow label={t('aiEngines.provider')}>
            <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {(engines.data?.providers ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormRow>
          <FormRow label={t('aiEngines.model')}>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-opus-4-8"
              maxLength={64}
            />
          </FormRow>
          <FormRow label={t('aiEngines.endpoint')}>
            <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} maxLength={255} />
            <p className="mt-1 text-xs text-gray-500">{t('aiEngines.endpointHint')}</p>
          </FormRow>
          <FormRow label={t('aiEngines.apiKey')}>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing?.hasApiKey ? t('aiEngines.keyStored') : ''}
              maxLength={512}
            />
            <p className="mt-1 text-xs text-gray-500">{t('aiEngines.apiKeyHint')}</p>
          </FormRow>
          {/* Who pays is a consequence of this field, so it is stated next to it. */}
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            {t('aiEngines.billingNote')}
          </p>
        </div>
      </Modal>
    </Card>
  );
}
