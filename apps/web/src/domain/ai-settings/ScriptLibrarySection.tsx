import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Field';
import { toast } from '@/store/toast-store';
import { useAiConfig, useAiConfigDefaults, useUpdateAiConfig } from './ai-settings.hooks';
import { ScenarioReplyEditor } from './ScenarioReplyEditor';
import type { ScenarioOverride } from './ai-settings.service';

/**
 * Every conversation shopTalk ships with, in one list (PLN-260903 S1-7).
 *
 * Four of the seven scripts are reachable only as a follow-up chip inside
 * another script, so before this section they existed in the product and
 * nowhere in the console — text going out to customers that no operator could
 * read, let alone change.
 */
export function ScriptLibrarySection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: defaults, isLoading } = useAiConfigDefaults();
  const { data: config } = useAiConfig();
  const updateConfig = useUpdateAiConfig();

  const [overrides, setOverrides] = useState<Record<string, ScenarioOverride>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (config) setOverrides(config.scenarioOverrides ?? {});
  }, [config]);

  const editedLangs = (action: string) => {
    const ov = overrides[action];
    if (!ov) return 0;
    const langs = new Set([...Object.keys(ov.utterance ?? {}), ...Object.keys(ov.reply ?? {})]);
    return langs.size;
  };

  const save = () =>
    updateConfig.mutate(
      { scenario_overrides: overrides, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setNote('');
          toast.success(t('scripts.saved'));
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : tc('error')),
      },
    );

  return (
    <Card title={t('scripts.title')}>
      <div className="space-y-3">
        <p className="text-xs text-gray-400">{t('scripts.hint')}</p>
        {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
        {defaults?.scripts.map((script) => {
          const edited = editedLangs(script.action);
          return (
            <div key={script.action} className="rounded-lg border border-gray-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-gray-700">{script.action}</span>
                <Badge tone={script.via === 'button' ? 'info' : 'gray'}>
                  {script.via === 'button'
                    ? t('scripts.viaButton', { action: script.buttonAction })
                    : t('scripts.viaFollowUp')}
                </Badge>
                {edited > 0 ? (
                  <Badge tone="success">{t('scripts.edited', { count: edited })}</Badge>
                ) : (
                  <span className="text-xs text-gray-400">{t('scripts.default')}</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setOpen(open === script.action ? null : script.action)}
                >
                  {open === script.action ? t('scripts.close') : t('scripts.view')}
                </Button>
              </div>
              {open === script.action && (
                <ScenarioReplyEditor
                  action={script.action}
                  script={script}
                  scriptActions={defaults.scripts.map((sc) => sc.action)}
                  value={overrides[script.action] ?? {}}
                  onChange={(next) =>
                    setOverrides((prev) => ({ ...prev, [script.action]: next }))
                  }
                />
              )}
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('changeNote')}
          />
          <Button onClick={save} disabled={updateConfig.isPending}>
            {updateConfig.isPending ? tc('saving') : tc('save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
