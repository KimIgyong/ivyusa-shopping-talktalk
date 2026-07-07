import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { useOrders } from './orders.hooks';
import type { OrderRow } from './orders.service';

const PAGE_SIZE = 20;

function fmtMoney(value?: number | null, currency?: string | null): string {
  if (typeof value !== 'number') return '—';
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
    } catch {
      return `${value.toLocaleString()} ${currency}`;
    }
  }
  return value.toLocaleString();
}

function fmtDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function OrdersPage() {
  const { t } = useTranslation('orders');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useOrders({ page, pageSize: PAGE_SIZE });

  const columns: Column<OrderRow>[] = [
    { key: 'orderNumber', header: t('orderNumber'), render: (o) => `#${o.orderNumber}` },
    {
      key: 'status',
      header: t('status'),
      render: (o) => <StatusBadge status={o.statusUi ?? o.statusInternal ?? undefined} />,
    },
    { key: 'amount', header: t('amount'), render: (o) => fmtMoney(o.total, o.currency) },
    { key: 'items', header: t('items'), render: (o) => o.itemCount ?? 0 },
    { key: 'createdAt', header: t('date'), render: (o) => fmtDate(o.createdAt) },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(o) => String(o.id)}
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
