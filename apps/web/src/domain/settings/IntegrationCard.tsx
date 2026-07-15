import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INTEGRATION_FIELDS, type EcommerceProvider } from './integration-providers';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { useIntegration, useSaveIntegration, useTestIntegration } from './settings.hooks';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Config-driven e-commerce integration card. Renders credential inputs from the
 * shared INTEGRATION_FIELDS schema for the given provider (cafe24/woocommerce/odoo/
 * haravan), with save + connection test. Secret fields are write-only.
 */
export function IntegrationCard({ provider }: { provider: EcommerceProvider }) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useIntegration(provider);
  const save = useSaveIntegration(provider);
  const test = useTestIntegration(provider);
  const specs = INTEGRATION_FIELDS[provider];

  const [values, setValues] = useState<Record<string, string>>({});

  // Seed non-secret inputs from the server once loaded; secret inputs stay blank.
  useEffect(() => {
    if (!data) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const s of specs) {
        if (!s.secret && next[s.key] === undefined) next[s.key] = data.fields[s.key] ?? '';
      }
      return next;
    });
  }, [data, specs]);

  const setField = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));

  const onSave = async () => {
    const config: Record<string, string> = {};
    for (const s of specs) {
      const v = (values[s.key] ?? '').trim();
      if (s.secret) {
        if (v) config[s.key] = v; // empty secret → keep stored value
      } else {
        config[s.key] = v;
      }
    }
    await save.mutateAsync(config);
    // Clear secret inputs after save (never re-shown).
    setValues((p) => {
      const next = { ...p };
      for (const s of specs) if (s.secret) next[s.key] = '';
      return next;
    });
  };

  const integ = data?.integration;
  const statusTone =
    integ?.status === 'connected' ? 'success' : integ?.status === 'error' ? 'error' : undefined;
  const configured = data?.credential.configured;
  const requiredMissing = specs.some(
    (s) => s.required && !s.secret && !(values[s.key] ?? '').trim(),
  );

  return (
    <Card title={t(`integrations.${provider}.title`)}>
      <p className="mb-4 text-sm text-gray-500">{t(`integrations.${provider}.subtitle`)}</p>

      {specs.map((s) => (
        <FormRow key={s.key} label={t(`integrations.fields.${s.key}`) + (s.required ? ' *' : '')}>
          <Input
            type={s.secret ? 'password' : 'text'}
            value={values[s.key] ?? ''}
            onChange={(e) => setField(s.key, e.target.value)}
            placeholder={
              s.secret
                ? data?.secrets[s.key]
                  ? t('integrations.configured')
                  : ''
                : t(`integrations.ph.${s.key}`, { defaultValue: '' })
            }
            autoComplete="off"
          />
        </FormRow>
      ))}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onSave} disabled={isLoading || save.isPending || requiredMissing}>
          {save.isPending ? tc('saving') : tc('save')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => test.mutate()}
          disabled={test.isPending || !configured}
        >
          {test.isPending ? t('integrations.testing') : t('integrations.testConnection')}
        </Button>
      </div>

      <div className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{t('integrations.connectionStatus')}:</span>
          {statusTone ? (
            <Badge tone={statusTone}>{t(`integrations.state.${integ?.status}`)}</Badge>
          ) : (
            <Badge>{t('integrations.state.unknown')}</Badge>
          )}
        </div>
        <div className="text-gray-500">
          {t('integrations.credential')}: {configured ? t('connected') : t('notSet')}
        </div>
        {integ?.detail && <div className="text-gray-500">{integ.detail}</div>}
        <div className="text-xs text-gray-400">
          {t('integrations.lastTested')}: {fmtDate(integ?.lastSyncAt)}
        </div>
      </div>
    </Card>
  );
}
