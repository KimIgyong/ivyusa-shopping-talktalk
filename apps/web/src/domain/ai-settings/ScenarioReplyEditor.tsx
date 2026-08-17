import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Input, Label, Select } from '@/components/Field';
import type { ScenarioLang, ScenarioOverride, ScenarioPostAction } from './ai-settings.service';
import { LanguageTabs } from './LanguageTabs';

const POST_ACTIONS: ScenarioPostAction['type'][] = [
  'none',
  'open_orders',
  'open_contact',
  'open_affiliate',
  'connect_agent',
  'open_url',
];

/** Actions whose reply comes from a built-in script — only these are editable. */
export const SCRIPTED_ACTIONS = new Set(['delivery_status', 'cancel_refund', 'product_help']);

/**
 * Per-action editor for a scenario button's scripted reply (PLN-AiSetting W2).
 * Every field is optional: whatever is left blank keeps the shipped copy, so
 * clearing a field is how a tenant reverts to the default.
 */
export function ScenarioReplyEditor({
  action,
  value,
  onChange,
}: {
  action: string;
  value: ScenarioOverride;
  onChange: (next: ScenarioOverride) => void;
}) {
  const { t } = useTranslation('aiSetting');
  const [lang, setLang] = useState<ScenarioLang>('KO');
  const scripted = SCRIPTED_ACTIONS.has(action);
  const postType = value.postAction?.type ?? 'none';

  const setReply = (text: string) =>
    onChange({ ...value, reply: { ...(value.reply ?? {}), [lang]: text } });

  const setFollowUp = (i: number, patch: { id?: string; label?: string }) =>
    onChange({
      ...value,
      followUps: (value.followUps ?? []).map((f, idx) =>
        idx === i
          ? {
              id: patch.id ?? f.id,
              label: patch.label === undefined ? f.label : { ...f.label, [lang]: patch.label },
            }
          : f,
      ),
    });

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
      <div className="flex items-center gap-2">
        <Label>{t('editor.language')}</Label>
        <LanguageTabs value={lang} onChange={setLang} filled={value.reply} />
      </div>

      {scripted ? (
        <div>
          <Label>{t('editor.reply')}</Label>
          <textarea
            rows={3}
            value={value.reply?.[lang] ?? ''}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('editor.replyPlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
          />
          <p className="mt-1 text-[11px] text-gray-400">{t('editor.blankHint')}</p>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">{t('editor.noScriptHint')}</p>
      )}

      {scripted && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('editor.followUps')}</Label>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({ ...value, followUps: [...(value.followUps ?? []), { id: '', label: {} }] })
              }
            >
              <Plus className="h-3.5 w-3.5" /> {t('editor.addFollowUp')}
            </Button>
          </div>
          {(value.followUps ?? []).map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={f.id}
                onChange={(e) => setFollowUp(i, { id: e.target.value })}
                placeholder={t('editor.followUpId')}
              />
              <Input
                value={f.label?.[lang] ?? ''}
                onChange={(e) => setFollowUp(i, { label: e.target.value })}
                placeholder={t('editor.followUpLabel')}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('remove')}
                onClick={() =>
                  onChange({ ...value, followUps: (value.followUps ?? []).filter((_, idx) => idx !== i) })
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label>{t('editor.postAction')}</Label>
          <Select
            value={postType}
            onChange={(e) =>
              onChange({
                ...value,
                postAction: { type: e.target.value as ScenarioPostAction['type'], url: value.postAction?.url },
              })
            }
          >
            {POST_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`postAction_${a}`)}
              </option>
            ))}
          </Select>
        </div>
        {postType === 'open_url' && (
          <div className="min-w-[240px] flex-1">
            <Label>{t('editor.url')}</Label>
            <Input
              value={value.postAction?.url ?? ''}
              onChange={(e) =>
                onChange({ ...value, postAction: { type: 'open_url', url: e.target.value } })
              }
              placeholder="https://…"
            />
          </div>
        )}
      </div>
    </div>
  );
}
