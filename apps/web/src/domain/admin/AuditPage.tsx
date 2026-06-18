import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { useAudit } from './admin.hooks';
import type { AuditEntry } from './admin.service';

const PAGE_SIZE = 20;

export function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAudit({ page, pageSize: PAGE_SIZE });

  const columns: Column<AuditEntry>[] = [
    { key: 'createdAt', header: 'Time', render: (r) => r.createdAt ?? '—' },
    { key: 'actor', header: 'Actor', render: (r) => r.actor ?? '—' },
    { key: 'action', header: 'Action', render: (r) => <Badge tone="info">{r.action}</Badge> },
    { key: 'target', header: 'Target', render: (r) => r.target ?? '—' },
    { key: 'ip', header: 'IP', render: (r) => r.ip ?? '—' },
  ];

  return (
    <div>
      <PageHeader title="Audit Log" />
      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        rowKey={(r) => r.id}
        emptyMessage="No audit entries."
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
