import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { useReviews, useSetReviewStatus } from './reviews.hooks';
import type { Review } from './reviews.service';

const PAGE_SIZE = 20;
const BODY_PREVIEW_CHARS = 80;

function fmtDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function truncate(text: string): string {
  return text.length > BODY_PREVIEW_CHARS ? `${text.slice(0, BODY_PREVIEW_CHARS)}…` : text;
}

/**
 * Review moderation console (PLN-260807-IvyusaApp-Revamp F2, D3): list the
 * tenant's reviews and hide/unhide them. Hiding filters storefront surfaces
 * only — the author still sees their own review in the widget/app.
 */
export function ReviewsPage() {
  const { t } = useTranslation('reviews');

  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useReviews({ page, pageSize: PAGE_SIZE });
  const setStatus = useSetReviewStatus();

  const columns: Column<Review>[] = [
    { key: 'id', header: t('id'), render: (r) => <span className="font-mono text-xs">#{r.id}</span> },
    {
      key: 'customerId',
      header: t('customer'),
      render: (r) => (r.customerId ? `#${r.customerId}` : '—'),
    },
    {
      key: 'orderItemId',
      header: t('orderItem'),
      render: (r) => (r.orderItemId ? `#${r.orderItemId}` : '—'),
    },
    {
      key: 'rating',
      header: t('rating'),
      render: (r) => (
        <span className="text-warning" aria-label={t('ratingOf', { rating: r.rating })}>
          {'★'.repeat(r.rating)}
          <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - r.rating))}</span>
        </span>
      ),
    },
    {
      key: 'body',
      header: t('body'),
      render: (r) => (r.body ? <span title={r.body}>{truncate(r.body)}</span> : '—'),
    },
    {
      key: 'status',
      header: t('status'),
      render: (r) =>
        r.status === 'hidden' ? (
          <Badge tone="warning">{t('statuses.hidden')}</Badge>
        ) : (
          <Badge tone="success">{t('statuses.submitted')}</Badge>
        ),
    },
    { key: 'createdAt', header: t('created'), render: (r) => fmtDate(r.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          disabled={setStatus.isPending}
          onClick={() =>
            setStatus.mutate({ id: r.id, status: r.status === 'hidden' ? 'submitted' : 'hidden' })
          }
        >
          {r.status === 'hidden' ? t('unhide') : t('hide')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Table<Review>
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(r) => r.id}
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
