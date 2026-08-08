import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Label, Select } from '@/components/Field';
import { cn } from '@/lib/cn';
import { useUsers } from '../users/users.hooks';
import { useAiConfig, useUpdateAiConfig } from './ai-settings.hooks';
import type { HandoffConfig, ScenarioLang } from './ai-settings.service';

const LANGS: ScenarioLang[] = ['EN', 'ES', 'KO'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];
/** A short, safe list — the server accepts any IANA zone. */
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Seoul',
  'UTC',
];

/**
 * Escalation routing (PLN-AiSetting W3): who gets paged, when agents are on
 * duty, and what happens (plus what the shopper is told) outside those hours.
 */
export function HandoffSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const { data: config, isLoading, error } = useAiConfig();
  const updateConfig = useUpdateAiConfig();
  const users = useUsers();

  const [assignees, setAssignees] = useState<string[]>([]);
  const [hoursOn, setHoursOn] = useState(false);
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  // One break window (lunch) is what tenants actually configure; the stored
  // shape is a list so a second one needs no schema change (PLN-260806 D2).
  const [breakOn, setBreakOn] = useState(false);
  const [breakStart, setBreakStart] = useState('12:00');
  const [breakEnd, setBreakEnd] = useState('13:00');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<Partial<Record<ScenarioLang, string>>>({});
  const [lang, setLang] = useState<ScenarioLang>('KO');
  // Policy deny-list rows (P2) — keywords edited as a comma-joined string.
  const [denyRows, setDenyRows] = useState<Array<{ keywords: string; type: string; label: string }>>(
    [],
  );

  useEffect(() => {
    const h = config?.handoffConfig;
    if (!h) return;
    setAssignees((h.assigneeUserIds ?? []).map(String));
    if (h.businessHours) {
      setHoursOn(true);
      setTimezone(h.businessHours.timezone || TIMEZONES[0]);
      setDays(h.businessHours.days ?? [1, 2, 3, 4, 5]);
      setStart(h.businessHours.start || '09:00');
      setEnd(h.businessHours.end || '18:00');
      const firstBreak = h.businessHours.breaks?.[0];
      if (firstBreak) {
        setBreakOn(true);
        setBreakStart(firstBreak.start || '12:00');
        setBreakEnd(firstBreak.end || '13:00');
      }
    }
    setEmail(h.offHours?.email ?? '');
    setNotice(h.offHours?.notice ?? {});
    setDenyRows(
      (h.denyRules ?? []).map((r) => ({
        keywords: (r.keywords ?? []).join(', '),
        type: r.type ?? 'other',
        label: r.label ?? 'consult',
      })),
    );
  }, [config]);

  // Only consult-label agents handle conversations, so only they can be assigned.
  const agents = (users.data ?? []).filter(
    (u) => u.labelCodes?.includes('consult') && u.status !== 'inactive',
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = () => {
    const handoff: HandoffConfig = {
      assigneeUserIds: assignees.map(Number).filter(Number.isFinite),
      ...(hoursOn
        ? {
            businessHours: {
              timezone,
              days,
              start,
              end,
              // Written even when empty: the console owns the whole config
              // object, so omitting the key would silently drop a stored break.
              breaks: breakOn ? [{ start: breakStart, end: breakEnd }] : [],
            },
          }
        : {}),
      ...(email.trim() || Object.keys(notice).length
        ? { offHours: { email: email.trim() || undefined, notice } }
        : {}),
    };
    const denyRules = denyRows
      .map((r) => ({
        keywords: r.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        type: r.type,
        label: r.label,
      }))
      .filter((r) => r.keywords.length > 0);
    if (denyRules.length) handoff.denyRules = denyRules;
    updateConfig.mutate({ handoff_config: handoff });
  };

  const smtpWarning = hoursOn && !email.trim();

  return (
    <Card title={t('handoff.title')}>
      {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
      {!isLoading && error && (
        <p className="text-sm text-error">{error instanceof Error ? error.message : tc('empty')}</p>
      )}
      {!isLoading && !error && (
        <div className="space-y-4">
          <div>
            <Label>{t('handoff.assignees')}</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {agents.length === 0 && (
                <p className="text-xs text-gray-400">{t('handoff.noAgents')}</p>
              )}
              {agents.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setAssignees((prev) => toggle(prev, u.id))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs',
                    assignees.includes(u.id)
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {u.email}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{t('handoff.assigneesHint')}</p>
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={hoursOn}
                onChange={(e) => setHoursOn(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              {t('handoff.useBusinessHours')}
            </label>

            {hoursOn && (
              <div className="space-y-2 pl-6">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px]">
                    <Label>{t('handoff.timezone')}</Label>
                    <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-28">
                    <Label>{t('handoff.start')}</Label>
                    <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div className="w-28">
                    <Label>{t('handoff.end')}</Label>
                    <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={breakOn}
                      onChange={(e) => setBreakOn(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                    />
                    {t('handoff.useBreak')}
                  </label>
                  {breakOn && (
                    <>
                      <div className="w-28">
                        <Label>{t('handoff.breakStart')}</Label>
                        <Input
                          type="time"
                          value={breakStart}
                          onChange={(e) => setBreakStart(e.target.value)}
                        />
                      </div>
                      <div className="w-28">
                        <Label>{t('handoff.breakEnd')}</Label>
                        <Input
                          type="time"
                          value={breakEnd}
                          onChange={(e) => setBreakEnd(e.target.value)}
                        />
                      </div>
                      <p className="pb-2 text-xs text-gray-400">{t('handoff.breakHint')}</p>
                    </>
                  )}
                </div>
                <div>
                  <Label>{t('handoff.days')}</Label>
                  <div className="mt-1 flex gap-1">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays((prev) => toggle(prev, d))}
                        className={cn(
                          'h-8 w-9 rounded border text-xs',
                          days.includes(d)
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-gray-200 bg-white text-gray-600',
                        )}
                      >
                        {t(`handoff.day_${d}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            <Label>{t('handoff.offHoursEmail')}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cs@example.com"
            />
            {smtpWarning && <p className="text-[11px] text-warning">{t('handoff.emailWarning')}</p>}

            <div className="flex items-center gap-2 pt-1">
              <Label>{t('handoff.offHoursNotice')}</Label>
              <div className="flex gap-1">
                {LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={cn(
                      'rounded px-2 py-0.5 text-xs',
                      l === lang
                        ? 'bg-primary-500 text-white'
                        : 'border border-gray-200 bg-white text-gray-600',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={2}
              value={notice[lang] ?? ''}
              onChange={(e) => setNotice((prev) => ({ ...prev, [lang]: e.target.value }))}
              placeholder={t('handoff.noticePlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            />
          </div>

          {/* Policy deny-list (P2): matched topics skip the AI and go to a human. */}
          <div className="border-t border-gray-100 pt-4">
            <Label>{t('handoff.denyTitle')}</Label>
            <p className="mb-2 mt-0.5 text-[11px] text-gray-400">{t('handoff.denyHint')}</p>
            <div className="space-y-2">
              {denyRows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={row.keywords}
                    placeholder={t('handoff.denyKeywordsPh')}
                    onChange={(e) =>
                      setDenyRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, keywords: e.target.value } : r)),
                      )
                    }
                  />
                  <Select
                    value={row.type}
                    onChange={(e) =>
                      setDenyRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, type: e.target.value } : r)),
                      )
                    }
                  >
                    {['order_status', 'delivery', 'cancel', 'refund', 'partnership', 'other'].map(
                      (v) => (
                        <option key={v} value={v}>
                          {t(`handoff.denyType.${v}`)}
                        </option>
                      ),
                    )}
                  </Select>
                  <Select
                    value={row.label}
                    onChange={(e) =>
                      setDenyRows((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)),
                      )
                    }
                  >
                    {['consult', 'accounting', 'operations'].map((v) => (
                      <option key={v} value={v}>
                        {t(`handoff.denyLabel.${v}`)}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-500 hover:underline"
                    onClick={() => setDenyRows((rows) => rows.filter((_, j) => j !== i))}
                  >
                    {tc('delete')}
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() =>
                setDenyRows((rows) => [...rows, { keywords: '', type: 'other', label: 'consult' }])
              }
            >
              {t('handoff.denyAdd')}
            </Button>
          </div>

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
