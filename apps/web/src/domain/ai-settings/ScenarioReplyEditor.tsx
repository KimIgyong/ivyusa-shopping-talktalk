import { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Input, Label, Select } from '@/components/Field';
import type {
  ScenarioLang,
  ScenarioOverride,
  ScenarioPostAction,
  ScenarioScriptDefault,
} from './ai-settings.service';
import { LanguageTabs } from './LanguageTabs';

const POST_ACTIONS: ScenarioPostAction['type'][] = [
  'none',
  'open_orders',
  'open_contact',
  'open_affiliate',
  'connect_agent',
  'open_url',
];

/**
 * Per-action editor for a scenario script (PLN-AiSetting W2, reworked by
 * PLN-260903).
 *
 * Two things changed. Which actions are editable now comes from the server's
 * script list instead of a hardcoded set here — that set named two actions
 * whose edits could never be spoken. And the shipped copy is shown as the
 * field's VALUE rather than hidden behind a "leave blank for the default"
 * hint: an operator could not read what the widget says today, so they were
 * rewriting text they had never seen.
 *
 * Saving text identical to the default stores no override (the API drops it),
 * so showing the defaults does not freeze them into the tenant's row.
 */
/** Chip ids the widget acts on: a control, or another shipped script. */
const CONTROL_FOLLOW_UP_IDS = ['agent_connect', 'my_orders', 'end_chat'];

export function ScenarioReplyEditor({
  action,
  value,
  onChange,
  script,
  scriptActions = [],
}: {
  /** The script key the copy is stored under — shown so it matches the list. */
  action: string;
  value: ScenarioOverride;
  onChange: (next: ScenarioOverride) => void;
  /** The shipped script this action runs, or undefined when it runs none. */
  script?: ScenarioScriptDefault;
  /** Every shipped script action — the other valid follow-up chip targets. */
  scriptActions?: string[];
}) {
  const { t } = useTranslation('aiSetting');
  const [lang, setLang] = useState<ScenarioLang>('KO');
  const scripted = !!script;
  const postType = value.postAction?.type ?? 'none';

  /** What the widget would say right now: the tenant's edit, else the default. */
  const effective = (field: 'utterance' | 'reply') =>
    value[field]?.[lang] ?? script?.[field]?.[lang] ?? '';
  const isEdited = (field: 'utterance' | 'reply') => {
    const own = value[field]?.[lang];
    return own !== undefined && own !== script?.[field]?.[lang];
  };
  /** Languages the tenant has actually changed — drives the tab dots. */
  const editedLangs = Object.fromEntries(
    (['utterance', 'reply'] as const).flatMap((f) =>
      Object.entries(value[f] ?? {}).filter(([l, v]) => v && v !== script?.[f]?.[l as ScenarioLang]),
    ),
  ) as Partial<Record<ScenarioLang, string>>;

  const validFollowUpIds = [...CONTROL_FOLLOW_UP_IDS, ...scriptActions];

  const revert = () => onChange({ ...value, utterance: undefined, reply: undefined, followUps: undefined });

  const setReply = (text: string) =>
    onChange({ ...value, reply: { ...(value.reply ?? {}), [lang]: text } });
  const setUtterance = (text: string) =>
    onChange({ ...value, utterance: { ...(value.utterance ?? {}), [lang]: text } });

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
      {/* Only these ids lead anywhere; anything else is saved and then fails
          when a shopper taps the chip, so they are offered rather than typed. */}
      <datalist id="scenario-followup-ids">
        {validFollowUpIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-gray-400">{action}</span>
        <Label>{t('editor.language')}</Label>
        <LanguageTabs value={lang} onChange={setLang} filled={editedLangs} />
        {scripted && Object.keys(editedLangs).length > 0 && (
          <Button size="sm" variant="ghost" onClick={revert} className="ml-auto">
            <RotateCcw className="h-3.5 w-3.5" /> {t('editor.revert')}
          </Button>
        )}
      </div>

      {scripted ? (
        <>
          <div>
            <div className="flex items-center gap-2">
              <Label>{t('editor.utterance')}</Label>
              {isEdited('utterance') && (
                <span className="text-[11px] text-primary-600">{t('editor.edited')}</span>
              )}
            </div>
            <Input
              aria-label={t('editor.utterance')}
              value={effective('utterance')}
              onChange={(e) => setUtterance(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-gray-400">{t('editor.utteranceHint')}</p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Label>{t('editor.reply')}</Label>
              {isEdited('reply') && (
                <span className="text-[11px] text-primary-600">{t('editor.edited')}</span>
              )}
            </div>
            <textarea
              aria-label={t('editor.reply')}
              rows={4}
              value={effective('reply')}
              onChange={(e) => setReply(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            />
            <p className="mt-1 text-[11px] text-gray-400">{t('editor.defaultShownHint')}</p>
          </div>
        </>
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
          {!value.followUps?.length && (
            <p className="text-[11px] text-gray-400">
              {t('editor.followUpsDefault', {
                chips:
                  script?.followUps.map((f) => f.label?.[lang] ?? f.id).join(' · ') ||
                  t('editor.followUpsNone'),
              })}
            </p>
          )}
          {(value.followUps ?? []).map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={f.id}
                list="scenario-followup-ids"
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
