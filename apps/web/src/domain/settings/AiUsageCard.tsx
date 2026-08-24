import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Field';
import { useAiUsage } from './settings.hooks';
import type { UsageGroupBy } from './settings.service';

type Preset = 'day' | 'week' | 'month' | 'custom' | 'all';

/** Local-time YYYY-MM-DD; `toISOString` would shift the day for anyone east of UTC. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function rangeFor(preset: Preset): { from: string; to: string } {
  const today = new Date();
  const to = ymd(today);
  const back = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return ymd(d);
  };
  if (preset === 'day') return { from: to, to };
  if (preset === 'week') return { from: back(6), to };
  if (preset === 'month') return { from: back(29), to };
  // "All" reaches back further than any recorded day; `since` in the response
  // tells the reader where the data actually starts.
  return { from: '2000-01-01', to };
}

/**
 * AI token usage (PLN-260824 A).
 *
 * Two things this screen refuses to do, because both would produce a number
 * that reads as authoritative and isn't:
 *  - it does not sum tenant-paid and platform-paid usage together; those reach
 *    different invoices
 *  - it shows no money. Per-model prices change, and a wrong figure here is
 *    worse than none
 */
export function AiUsageCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [preset, setPreset] = useState<Preset>('month');
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('feature');
  const [customFrom, setCustomFrom] = useState(rangeFor('month').from);
  const [customTo, setCustomTo] = useState(rangeFor('day').to);

  const range = useMemo(
    () => (preset === 'custom' ? { from: customFrom, to: customTo } : rangeFor(preset)),
    [preset, customFrom, customTo],
  );
  const usage = useAiUsage(range.from, range.to, groupBy);

  const presets: Preset[] = ['day', 'week', 'month', 'custom', 'all'];
  const axes: UsageGroupBy[] = ['feature', 'function', 'engine', 'owner'];
  const num = (n: number) => n.toLocaleString();

  return (
    <Card title={t('aiUsage.title')}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? 'primary' : 'secondary'}
            onClick={() => setPreset(p)}
          >
            {t(`aiUsage.preset.${p}`)}
          </Button>
        ))}
        <span className="mx-2 h-4 w-px bg-gray-200" />
        {axes.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={groupBy === a ? 'primary' : 'secondary'}
            onClick={() => setGroupBy(a)}
          >
            {t(`aiUsage.axis.${a}`)}
          </Button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="text-gray-400">~</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      ) : null}

      {usage.isLoading ? <p className="text-sm text-gray-500">{tc('loading')}</p> : null}
      {usage.error ? (
        <p className="text-sm text-red-600">{(usage.error as Error).message}</p>
      ) : null}

      {usage.data ? (
        <>
          {/* Without this line a month before the meter existed reads as "we
              used nothing", which is a different and wrong statement. */}
          <p className="mb-2 text-xs text-gray-500">
            {usage.data.since
              ? t('aiUsage.since', { date: usage.data.since })
              : t('aiUsage.noneYet')}
          </p>

          {usage.data.buckets.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-2">{t(`aiUsage.axis.${groupBy}`)}</th>
                    <th className="py-2 text-right">{t('aiUsage.calls')}</th>
                    <th className="py-2 text-right">{t('aiUsage.tokensIn')}</th>
                    <th className="py-2 text-right">{t('aiUsage.tokensOut')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data.buckets.map((b) => (
                    <tr key={b.key} className="border-b border-gray-100">
                      <td className="py-2">
                        {groupBy === 'owner' ? t(`aiUsage.owner.${b.key}`) : b.label}
                        {b.stubCalls ? (
                          <Badge tone="warning">
                            {t('aiUsage.stub', { count: b.stubCalls })}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 text-right tabular-nums">{num(b.calls)}</td>
                      <td className="py-2 text-right tabular-nums">{num(b.tokensIn)}</td>
                      <td className="py-2 text-right tabular-nums">{num(b.tokensOut)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2">{t('aiUsage.total')}</td>
                    <td className="py-2 text-right tabular-nums">{num(usage.data.totals.calls)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {num(usage.data.totals.tokensIn)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {num(usage.data.totals.tokensOut)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('aiUsage.empty')}</p>
          )}

          {usage.data.totals.stubCalls ? (
            <p className="mt-2 text-xs text-amber-700">
              {t('aiUsage.stubNote', { count: usage.data.totals.stubCalls })}
            </p>
          ) : null}
          {/* Said once, plainly: this screen counts tokens and nothing else. */}
          <p className="mt-2 text-xs text-gray-500">{t('aiUsage.noMoneyNote')}</p>
        </>
      ) : null}
    </Card>
  );
}
