import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { FormRow, Select } from '@/components/Field';
import { useConversations } from './history.hooks';
import type { ConversationRow } from './history.service';

const PAGE_SIZE = 20;

type StatusFilter = '' | 'open' | 'resolved' | 'escalated' | 'ended';
type EscalatedFilter = 'all' | 'yes' | 'no';

function fmtDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function HistoryPage() {
  const { t } = useTranslation('history');
  const { t: tc } = useTranslation('common');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('');
  const [escalated, setEscalated] = useState<EscalatedFilter>('all');
  const [selected, setSelected] = useState<ConversationRow | null>(null);

  const { data, isLoading, error } = useConversations({
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
    escalated: escalated === 'all' ? undefined : escalated === 'yes',
  });

  const columns: Column<ConversationRow>[] = [
    { key: 'id', header: t('id'), render: (r) => <span className="font-mono">{r.id.slice(0, 8)}</span> },
    { key: 'customer', header: t('customer'), render: (r) => r.customerName ?? '—' },
    { key: 'status', header: t('status'), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'escalated',
      header: t('escalated'),
      render: (r) =>
        r.escalated ? <Badge tone="error">{tc('yes')}</Badge> : <Badge tone="gray">{tc('no')}</Badge>,
    },
    { key: 'messages', header: t('messages'), render: (r) => r.messageCount ?? 0 },
    { key: 'startedAt', header: t('started'), render: (r) => fmtDate(r.startedAt) },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormRow label={t('status')}>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="open">{t('open')}</option>
              <option value="resolved">{t('resolved')}</option>
              <option value="escalated">{t('escalated')}</option>
              <option value="ended">{t('ended_status')}</option>
            </Select>
          </FormRow>
          <FormRow label={t('escalated')}>
            <Select
              value={escalated}
              onChange={(e) => {
                setEscalated(e.target.value as EscalatedFilter);
                setPage(1);
              }}
            >
              <option value="all">{tc('all')}</option>
              <option value="yes">{tc('yes')}</option>
              <option value="no">{tc('no')}</option>
            </Select>
          </FormRow>
        </div>
      </Card>

      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(r) => r.id}
        onRowClick={(r) => setSelected(r)}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t('detailTitle')}
        size="md"
      >
        {selected && (
          <dl className="space-y-3 text-sm">
            <DetailRow label={t('id')} value={selected.id} mono />
            <DetailRow label={t('customer')} value={selected.customerName} />
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">{t('status')}</dt>
              <dd>
                <StatusBadge status={selected.status} />
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-gray-500">{t('summary')}</dt>
              <dd className="text-right text-gray-700">{selected.summary ?? '—'}</dd>
            </div>
            <DetailRow label={t('started')} value={fmtDate(selected.startedAt)} />
            <DetailRow label={t('ended')} value={fmtDate(selected.endedAt)} />
          </dl>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? 'font-mono text-gray-700' : 'text-gray-700'}>{value ?? '—'}</dd>
    </div>
  );
}
