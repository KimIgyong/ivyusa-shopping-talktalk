import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { useAudit } from './admin.hooks';
import type { AuditEntry } from './admin.service';

const PAGE_SIZE = 20;

export function AuditPage() {
  const { t } = useTranslation('audit');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAudit({ page, pageSize: PAGE_SIZE });

  const columns: Column<AuditEntry>[] = [
    { key: 'createdAt', header: t('time'), render: (r) => r.createdAt ?? '—' },
    { key: 'actor', header: t('actor'), render: (r) => r.actor ?? '—' },
    { key: 'action', header: t('action'), render: (r) => <Badge tone="info">{r.action}</Badge> },
    { key: 'target', header: t('target'), render: (r) => r.target ?? '—' },
    { key: 'ip', header: t('ip'), render: (r) => r.ip ?? '—' },
  ];

  return (
    <div>
      <PageHeader title={t('title')} />
      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        rowKey={(r) => r.id}
        emptyMessage={t('empty')}
      />
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />
    </div>
  );
}
