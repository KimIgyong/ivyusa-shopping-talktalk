import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { ChannelBadge } from '../live-chat/ChannelBadge';
import {
  useAgentStats,
  useChannelStats,
  useHourStats,
  useResolutionStats,
} from './statistics.hooks';
import type { AgentRow, ChannelRow } from './statistics.service';

/** Below this many ratings an average says more about luck than service. */
const MIN_CSAT_SAMPLE = 5;

const pct = (v: number) => `${Math.round(v * 100)}%`;

interface RangeProps {
  from: string;
  to: string;
}

/** Where conversations come from, and how they differ once they arrive. */
export function ChannelSection({ from, to }: RangeProps) {
  const { t } = useTranslation('statistics');
  const { data, isLoading, error } = useChannelStats(from, to);

  const columns: Column<ChannelRow>[] = [
    {
      key: 'channel',
      header: t('channel.name'),
      render: (r) => <ChannelBadge channel={r.channel} />,
    },
    {
      key: 'conversations',
      header: t('channel.conversations'),
      render: (r) => <span className="tabular-nums">{r.conversations.toLocaleString()}</span>,
    },
    {
      key: 'inbound',
      header: t('channel.inbound'),
      render: (r) => <span className="tabular-nums">{r.inbound.toLocaleString()}</span>,
    },
    {
      key: 'median',
      header: t('channel.median'),
      // Median first, mean second and greyed: the mean is the one a group room
      // distorts, so it reads as context rather than as the headline.
      render: (r) => (
        <span className="tabular-nums">
          {r.medianMessages}
          <span className="ml-1 text-xs text-gray-400">
            {t('channel.avgShort', { value: r.avgMessages })}
          </span>
        </span>
      ),
    },
    {
      key: 'escalation',
      header: t('channel.escalation'),
      render: (r) => (
        <span className="tabular-nums">
          {pct(r.escalationRate)}
          <span className="ml-1 text-xs text-gray-400">({r.escalated})</span>
        </span>
      ),
    },
  ];

  return (
    <Card title={t('channel.title')}>
      <p className="mb-2 text-xs text-gray-500">{t('channel.hint')}</p>
      <Table<ChannelRow>
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('channel.empty')}
        rowKey={(r) => r.channel}
      />
    </Card>
  );
}

/** AI agents and people, in separate tables — see the service for why. */
export function AgentSection({ from, to }: RangeProps) {
  const { t } = useTranslation('statistics');
  const { data, isLoading, error } = useAgentStats(from, to);

  const columns = (kind: 'ai' | 'human'): Column<AgentRow>[] => [
    { key: 'name', header: t('agents.name'), render: (r) => r.name },
    {
      key: 'conversations',
      header: t('agents.conversations'),
      render: (r) => <span className="tabular-nums">{r.conversations.toLocaleString()}</span>,
    },
    ...(kind === 'human'
      ? [
          {
            key: 'replies',
            header: t('agents.replies'),
            render: (r: AgentRow) => (
              <span className="tabular-nums">{r.replies.toLocaleString()}</span>
            ),
          },
        ]
      : []),
    {
      key: 'resolved',
      header: t('agents.resolved'),
      render: (r) => (
        <span className="tabular-nums">
          {pct(r.resolutionRate)}
          <span className="ml-1 text-xs text-gray-400">({r.resolved})</span>
        </span>
      ),
    },
    {
      key: 'csat',
      header: t('agents.csat'),
      // An average over two ratings is not a score. Say the sample is thin
      // rather than printing a number that will be read as one.
      render: (r) =>
        r.csatRated >= MIN_CSAT_SAMPLE && r.csatAvg != null ? (
          <span className="tabular-nums">
            {r.csatAvg.toFixed(2)}
            <span className="ml-1 text-xs text-gray-400">({r.csatRated})</span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">
            {t('agents.thinSample', { count: r.csatRated })}
          </span>
        ),
    },
  ];

  return (
    <>
      <Card title={t('agents.aiTitle')} className="mb-4">
        <p className="mb-2 text-xs text-gray-500">{t('agents.aiHint')}</p>
        <Table<AgentRow>
          columns={columns('ai')}
          data={data?.ai ?? []}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage={t('agents.empty')}
          rowKey={(r) => `ai-${r.id ?? 'default'}`}
        />
      </Card>
      <Card title={t('agents.humanTitle')}>
        <p className="mb-2 text-xs text-gray-500">{t('agents.humanHint')}</p>
        <Table<AgentRow>
          columns={columns('human')}
          data={data?.human ?? []}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage={t('agents.emptyHuman')}
          rowKey={(r) => `human-${r.id ?? 0}`}
        />
      </Card>
    </>
  );
}

/** How conversations ended — one definition, shared with the journey report. */
export function ResolutionSection({ from, to }: RangeProps) {
  const { t } = useTranslation('statistics');
  const { data, isLoading, error } = useResolutionStats(from, to);
  const total = (data?.byReason ?? []).reduce((sum, r) => sum + r.count, 0);

  return (
    <Card title={t('resolution.title')}>
      <p className="mb-3 text-xs text-gray-500">{t('resolution.hint')}</p>
      {isLoading && <p className="text-sm text-gray-400">…</p>}
      {/* A failed request must not read as "no conversations" — that is a
          number, and it would be a wrong one. */}
      {!isLoading && error && <p className="text-sm text-error">{(error as Error).message}</p>}
      {!isLoading && !error && !total && (
        <p className="text-sm text-gray-400">{t('resolution.empty')}</p>
      )}
      {!isLoading && !error && !!total && (
        <>
          <p className="mb-3 text-sm text-gray-700">
            {t('resolution.headline', {
              rate: pct(data?.resolutionRate ?? 0),
              resolved: data?.resolved ?? 0,
              ended: data?.ended ?? 0,
            })}
          </p>
          <ul className="space-y-1.5">
            {(data?.byReason ?? []).map((r) => (
              <li key={r.reason} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 text-gray-700">
                  {t(`resolution.reason.${r.reason}`, { defaultValue: r.reason })}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-gray-100">
                  <span
                    className={`block h-full ${r.resolved ? 'bg-success' : 'bg-warning'}`}
                    style={{ width: `${(r.count / total) * 100}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-gray-600">
                  {r.count} · {Math.round((r.count / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** When customers write, in the tenant's own clock. */
export function HourSection({ from, to }: RangeProps) {
  const { t } = useTranslation('statistics');
  const { data, isLoading, error } = useHourStats(from, to);
  const grid = data?.grid ?? [];
  const peak = Math.max(1, ...grid.flat());

  return (
    <Card title={t('hours.title')}>
      {/* The zone is stated, never implied: nine of eleven tenants have none
          set, and a peak drawn in the wrong clock is off by nine hours. */}
      <p className="mb-3 text-xs text-gray-500">
        {t(data?.timezoneSource === 'tenant' ? 'hours.zoneTenant' : 'hours.zoneDefault', {
          zone: data?.timezone ?? 'UTC',
        })}
      </p>
      {isLoading && <p className="text-sm text-gray-400">…</p>}
      {!isLoading && error && <p className="text-sm text-error">{(error as Error).message}</p>}
      {!isLoading && !error && !data?.total && (
        <p className="text-sm text-gray-400">{t('hours.empty')}</p>
      )}
      {!isLoading && !error && !!data?.total && (
        <div className="overflow-x-auto">
          <table className="text-[10px]">
            <thead>
              <tr>
                <th className="pr-2" />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="px-0.5 font-normal text-gray-400">
                    {h % 3 === 0 ? h : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, day) => (
                <tr key={DAY_KEYS[day]}>
                  <td className="pr-2 text-gray-500">{t(`hours.day.${DAY_KEYS[day]}`)}</td>
                  {row.map((count, hour) => (
                    <td key={hour} className="p-0.5">
                      <span
                        title={`${count}`}
                        className="block h-4 w-4 rounded-sm"
                        style={{
                          backgroundColor:
                            count === 0
                              ? 'rgb(243 244 246)'
                              : `rgba(37, 99, 235, ${0.15 + 0.85 * (count / peak)})`,
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-400">
            {t('hours.total', { count: data.total })}
          </p>
        </div>
      )}
    </Card>
  );
}
