import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { FormRow, Input } from '@/components/Field';
import { useQuestionStats } from './statistics.hooks';
import { DIMENSION_TABS } from './statistics.service';
import type { Dimension, StatRow } from './statistics.service';
import { TrendChart } from './TrendChart';

/** Below this confidence an answer is treated as shaky (matches RAG_MIN_SIMILARITY). */
const LOW_CONFIDENCE = 0.45;
/** Escalation rate above which a topic is worth a knowledge fix. */
const HIGH_ESCALATION = 0.25;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Customer question statistics (SCR-104 §4). Four lenses over the same daily
 * snapshots — intent, cited knowledge, keyword, and similar-question cluster —
 * so the table and chart are one implementation and the tab only changes a
 * query parameter.
 */
export function StatisticsPage() {
  const { t } = useTranslation('statistics');
  const navigate = useNavigate();

  const [dimension, setDimension] = useState<Dimension>('intent');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));

  const { data, isLoading, error } = useQuestionStats({ dimension, from, to });
  const total = data?.total ?? 0;

  /** A topic people ask about but the AI handles badly is where knowledge work pays off. */
  const needsAttention = (r: StatRow) =>
    r.escalationRate >= HIGH_ESCALATION ||
    (r.avgConfidence !== null && r.avgConfidence < LOW_CONFIDENCE);

  const columns: Column<StatRow>[] = [
    {
      key: 'label',
      header: t(`dimension.${dimension}`),
      render: (r) => (
        <span className="flex items-center gap-1.5">
          {needsAttention(r) && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />}
          <span className="truncate">{r.label || r.key}</span>
        </span>
      ),
    },
    { key: 'asked', header: t('asked'), render: (r) => <span className="tabular-nums">{r.asked}</span> },
    {
      key: 'share',
      header: t('share'),
      render: (r) => (
        <span className="tabular-nums">{total > 0 ? `${((r.asked / total) * 100).toFixed(1)}%` : '—'}</span>
      ),
    },
    {
      key: 'escalationRate',
      header: t('escalationRate'),
      render: (r) => (
        <span className={`tabular-nums ${r.escalationRate >= HIGH_ESCALATION ? 'text-error' : ''}`}>
          {`${(r.escalationRate * 100).toFixed(0)}%`}
        </span>
      ),
    },
    {
      key: 'noSource',
      header: t('noSource'),
      render: (r) => <span className="tabular-nums">{r.noSource}</span>,
    },
    {
      key: 'avgConfidence',
      header: t('avgConfidence'),
      render: (r) =>
        r.avgConfidence === null ? (
          <span className="text-gray-400">—</span>
        ) : (
          <Badge tone={r.avgConfidence >= LOW_CONFIDENCE ? 'success' : 'warning'}>
            {r.avgConfidence.toFixed(2)}
          </Badge>
        ),
    },
  ];

  // Only the document lens has somewhere specific to go: its key is a KB id.
  const onRowClick =
    dimension === 'document' ? (r: StatRow) => navigate(`/knowledge?doc=${r.key}`) : undefined;

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormRow label={t('from')}>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </FormRow>
          <FormRow label={t('to')}>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </FormRow>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {DIMENSION_TABS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDimension(d)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              dimension === d
                ? 'border-primary-600 font-medium text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(`tab.${d}`)}
          </button>
        ))}
      </div>

      <Card className="mb-4" title={t('trendTitle')}>
        <TrendChart data={data?.trend ?? []} />
      </Card>

      <Table
        columns={columns}
        data={data?.top}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(r) => r.key}
        onRowClick={onRowClick}
      />

      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        {t('attentionHint')}
      </p>
      <p className="mt-1 text-xs text-gray-400">{t('snapshotNote')}</p>
    </div>
  );
}
