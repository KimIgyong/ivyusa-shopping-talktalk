import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { useDocuments, useSourceRuns } from './knowledge.hooks';
import type { KnowledgeDocument, KnowledgeSource, SourceRun } from './knowledge.service';

const DOC_PAGE_SIZE = 10;

/**
 * Conversion history of one knowledge source (PLN-260828): what its syncs did
 * (run history, failures included since 2026-08-28) and which documents it
 * produced — hidden ones included, because "where did that page go" is
 * exactly what this view exists to answer.
 */
export function SourceHistoryModal({
  source,
  onClose,
  onOpenDocument,
}: {
  source: KnowledgeSource | null;
  onClose: () => void;
  onOpenDocument: (id: string) => void;
}) {
  const { t } = useTranslation('knowledge');
  const [page, setPage] = useState(1);

  const runs = useSourceRuns(source?.id ?? null);
  const documents = useDocuments({
    page,
    size: DOC_PAGE_SIZE,
    sourceId: source?.id ?? undefined,
  });

  const runColumns: Column<SourceRun>[] = [
    {
      key: 'at',
      header: t('history.runAt'),
      className: 'whitespace-nowrap',
      render: (r) => new Date(r.at).toLocaleString(),
    },
    {
      key: 'status',
      header: t('history.runStatus'),
      render: (r) => (
        <Badge tone={r.status === 'ok' ? 'success' : 'error'}>
          {r.status === 'ok' ? t('history.runOk') : t('history.runFailed')}
        </Badge>
      ),
    },
    {
      key: 'counts',
      header: t('history.runCounts'),
      render: (r) =>
        r.status === 'ok' ? (
          <span className="tabular-nums">
            {t('history.countsLine', {
              created: r.result.created ?? 0,
              updated: r.result.updated ?? 0,
              skipped: r.result.skipped ?? 0,
              hidden: r.result.hidden ?? 0,
            })}
            {!!r.result.dropped && (
              <span className="ml-1 text-error">{t('syncDropped', { count: r.result.dropped })}</span>
            )}
            {!!r.result.truncated && (
              <span className="ml-1 text-error">
                {t('syncTruncated', { count: r.result.truncated })}
              </span>
            )}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'embedded',
      header: t('history.runEmbedded'),
      render: (r) =>
        r.result.embedded != null ? <span className="tabular-nums">{String(r.result.embedded)}</span> : '—',
    },
    {
      key: 'elapsed',
      header: t('history.runElapsed'),
      className: 'whitespace-nowrap',
      render: (r) =>
        r.result.elapsedMs != null ? `${(Number(r.result.elapsedMs) / 1000).toFixed(1)}s` : '—',
    },
    {
      key: 'error',
      header: t('history.runError'),
      render: (r) =>
        r.result.error ? (
          <span className="text-xs text-error" title={String(r.result.error)}>
            {String(r.result.error)}
          </span>
        ) : (
          ''
        ),
    },
  ];

  const docColumns: Column<KnowledgeDocument>[] = [
    {
      key: 'title',
      header: t('title_column'),
      className: 'w-full',
      render: (r) => (
        <button
          type="button"
          className="text-left font-medium text-primary-600 hover:underline"
          onClick={() => onOpenDocument(r.id)}
        >
          {r.title}
        </button>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      className: 'whitespace-nowrap',
      render: (r) => (r.category ? <Badge tone="info">{r.category}</Badge> : '—'),
    },
    {
      key: 'status',
      header: t('status'),
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'active',
      header: t('active'),
      render: (r) => (
        <Badge tone={r.active === 1 ? 'success' : 'warning'}>
          {r.active === 1 ? t('visible') : t('hidden')}
        </Badge>
      ),
    },
    {
      key: 'updatedAt',
      header: t('updated'),
      className: 'whitespace-nowrap',
      render: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'),
    },
  ];

  return (
    <Modal
      open={!!source}
      onClose={onClose}
      title={source ? t('history.title', { name: source.name }) : ''}
      size="lg"
    >
      {source && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <Badge tone="gray">{source.type}</Badge>
            {typeof source.configJson?.targetId === 'string' && (
              <span className="max-w-md truncate text-xs text-gray-400" title={source.configJson.targetId}>
                {source.configJson.targetId}
              </span>
            )}
            {source.lastSyncAt && (
              <span className="text-xs text-gray-500">
                {t('history.lastSync', { when: new Date(source.lastSyncAt).toLocaleString() })}{' '}
                <Badge tone={source.lastSyncStatus === 'failed' ? 'error' : 'success'}>
                  {source.lastSyncStatus ?? 'ok'}
                </Badge>
              </span>
            )}
          </div>

          <section>
            <h3 className="mb-1 text-sm font-semibold text-gray-800">{t('history.runsTitle')}</h3>
            <p className="mb-2 text-xs text-gray-400">{t('history.runsHint')}</p>
            <Table<SourceRun>
              columns={runColumns}
              data={runs.data}
              loading={runs.isLoading}
              error={runs.error ? (runs.error as Error).message : null}
              emptyMessage={t('history.noRuns')}
              rowKey={(r) => r.at + r.status}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-800">
              {t('history.documentsTitle', { count: documents.data?.total ?? 0 })}
            </h3>
            <Table<KnowledgeDocument>
              columns={docColumns}
              data={documents.data?.items}
              loading={documents.isLoading}
              error={documents.error ? (documents.error as Error).message : null}
              emptyMessage={t('history.noDocuments')}
              rowKey={(r) => r.id}
            />
            <Pagination
              page={page}
              pageSize={DOC_PAGE_SIZE}
              total={documents.data?.total ?? 0}
              onPageChange={setPage}
            />
          </section>

        </div>
      )}
    </Modal>
  );
}
