import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { Progress } from '@/components/Progress';
import { Pagination } from '@/components/Pagination';
import { FormRow, Input, Select } from '@/components/Field';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KnowledgeQaPanel } from './KnowledgeQaPanel';
import { ConflictReview } from './ConflictReview';
import { RevisionHistory } from './RevisionHistory';
import {
  useMarkReviewed,
  useCategories,
  useSources,
  useCreateSource,
  useSetSourceStatus,
  useSyncSource,
  useDocuments,
  useDocument,
  useCreateDocument,
  useImportProducts,
  useCatalogSyncPreview,
  useSyncCatalog,
  useCatalogSyncStatus,
  useCatalogSyncCompletion,
  useUpdateDocument,
  useDeleteDocument,
} from './knowledge.hooks';
import type { KnowledgeSource, KnowledgeDocument } from './knowledge.service';

const PAGE_SIZE = 20;
const SOURCE_TYPES = ['board', 'repository', 'gdrive'];
/** Known category values: legacy seed tags + policy import taxonomy. */
const CATEGORIES = [
  'faq',
  'policy',
  'product',
  'warranty',
  'policy_legal',
  'policy_shipping',
  'policy_return',
  'policy_cancellation',
  'policy_claims',
  'policy_payment',
  'policy_promotion',
  'policy_membership',
  'policy_professional',
  'policy_beautizen',
  'policy_roundtable',
  'policy_b2b',
  'policy_safety',
  'policy_fraud',
];

export function KnowledgePage() {
  const { t } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');
  const sources = useSources();
  const createSource = useCreateSource();
  const setSourceStatus = useSetSourceStatus();
  const syncSource = useSyncSource();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  // '' = all groups. Switching groups clears the category, which belongs to the
  // group that was selected.
  const [group, setGroup] = useState('');
  const documents = useDocuments({
    page,
    size: PAGE_SIZE,
    category: category || undefined,
    group: group || undefined,
  });
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();
  const markReviewed = useMarkReviewed();

  // Always fetched ungrouped: the tab counts need every group, and the category
  // list is derived from the same rows.
  const categories = useCategories();
  const allCounts = categories.data ?? [];
  const groupTotals = allCounts.reduce<Record<string, number>>((acc, c) => {
    acc[c.group] = (acc[c.group] ?? 0) + c.total;
    return acc;
  }, {});
  const visibleCounts = group ? allCounts.filter((c) => c.group === group) : allCounts;
  // Same category name can appear under two groups; merge for display.
  const mergedCategories = Object.values(
    visibleCounts.reduce<Record<string, { category: string | null; total: number; active: number }>>(
      (acc, c) => {
        const k = c.category ?? '';
        acc[k] = acc[k]
          ? { ...acc[k], total: acc[k].total + c.total, active: acc[k].active + c.active }
          : { category: c.category, total: c.total, active: c.active };
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.total - a.total);
  const categoryTotal = visibleCounts.reduce((sum, c) => sum + c.total, 0);
  const selectGroup = (value: string) => {
    setGroup(value);
    setCategory('');
    setPage(1);
  };
  // Suggest what this tenant actually uses, plus the known taxonomy for a tenant
  // that has not created anything yet.
  const categorySuggestions = [
    ...new Set([
      ...allCounts.map((c) => c.category).filter((c): c is string => !!c),
      ...CATEGORIES,
    ]),
  ];
  const selectCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'content' | 'history'>('content');
  const detail = useDocument(detailId);
  // Edit mode for the detail modal — also entered directly from a QA source.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSourceUrl, setEditSourceUrl] = useState('');
  const [editEffectiveFrom, setEditEffectiveFrom] = useState('');
  const [editReviewDays, setEditReviewDays] = useState('');

  // Load the fetched document into the edit fields whenever it changes.
  useEffect(() => {
    if (detail.data) {
      setEditTitle(detail.data.title);
      setEditCategory(detail.data.category ?? '');
      setEditContent(detail.data.content ?? '');
      setEditSourceUrl(detail.data.sourceUrl ?? '');
      setEditEffectiveFrom(detail.data.effectiveFrom ?? '');
      setEditReviewDays(
        detail.data.reviewIntervalDays == null ? '' : String(detail.data.reviewIntervalDays),
      );
    }
  }, [detail.data]);

  // Deep link from a conversation transcript's grounding badge (?doc=<id>):
  // "which document produced this answer" has to land on the document itself,
  // not on page 1 of the list. Consumed once so closing the modal sticks.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const doc = searchParams.get('doc');
    if (!doc) return;
    setDetailId(doc);
    searchParams.delete('doc');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeDetail = () => {
    setDetailId(null);
    setEditing(false);
    setDetailTab('content');
  };

  const saveEdit = () => {
    if (!detail.data) return;
    updateDocument.mutate(
      {
        id: detail.data.id,
        body: {
          title: editTitle,
          category: editCategory,
          content: editContent,
          // Empty input clears the field rather than leaving a stale value —
          // null is a meaningful state for all three.
          source_url: editSourceUrl.trim() || null,
          effective_from: editEffectiveFrom || null,
          review_interval_days: editReviewDays.trim() === '' ? null : Number(editReviewDays),
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importProducts = useImportProducts();

  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogPreview = useCatalogSyncPreview(catalogOpen);
  const syncCatalog = useSyncCatalog();
  // Poll while the dialog is open OR a run is still in flight, so closing the
  // dialog does not orphan a job the operator started.
  const catalogJob = useCatalogSyncStatus(catalogOpen || syncCatalog.isSuccess);
  const job = catalogJob.data ?? null;
  const jobRunning = job?.status === 'running';
  useCatalogSyncCompletion(job);
  // A run with nothing to create or update would still spend a round trip and
  // read as if something happened; the button says so instead.
  const nothingToApply =
    !!catalogPreview.data &&
    catalogPreview.data.created === 0 &&
    catalogPreview.data.updated === 0;

  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('');
  const [docContent, setDocContent] = useState('');

  const closeSource = () => {
    setSourceOpen(false);
    setSourceName('');
    setSourceType(SOURCE_TYPES[0]);
  };

  const saveSource = () => {
    createSource.mutate({ name: sourceName, type: sourceType }, { onSuccess: closeSource });
  };

  const closeDoc = () => {
    setDocOpen(false);
    setDocTitle('');
    setDocCategory('');
    setDocContent('');
  };

  const saveDoc = () => {
    createDocument.mutate(
      { title: docTitle, category: docCategory, content: docContent },
      { onSuccess: closeDoc },
    );
  };

  const removeDoc = (id: string) => {
    if (window.confirm(t('deleteDocumentConfirm'))) {
      deleteDocument.mutate(id, { onSuccess: () => setDetailId(null) });
    }
  };

  const toggleActive = (doc: { id: string; active: number }) => {
    updateDocument.mutate({ id: doc.id, body: { active: doc.active === 1 ? 0 : 1 } });
  };

  const sourceColumns: Column<KnowledgeSource>[] = [
    { key: 'name', header: t('name'), render: (r) => r.name },
    { key: 'type', header: t('type'), render: (r) => r.type },
    {
      key: 'status',
      header: t('status'),
      // A type with no adapter says so plainly. Showing it as "Enabled" is what
      // made operators believe a gdrive source was ingesting when nothing was.
      render: (r) =>
        r.supported === false ? (
          <Badge tone="warning">{t('sourceNotReady')}</Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={setSourceStatus.isPending}
            onClick={() =>
              setSourceStatus.mutate({
                id: r.id,
                status: r.status === 'active' ? 'inactive' : 'active',
              })
            }
          >
            <Badge tone={r.status === 'active' ? 'success' : 'gray'}>
              {r.status === 'active' ? tc('enabled') : tc('disabled')}
            </Badge>
          </Button>
        ),
    },
    {
      key: 'lastSync',
      header: t('lastSync'),
      render: (r) => {
        if (!r.lastSyncAt) return <span className="text-gray-400">—</span>;
        const when = new Date(r.lastSyncAt).toLocaleString();
        const c = r.lastSyncResult;
        return (
          <div className="flex flex-col gap-0.5">
            <span className={r.lastSyncStatus === 'failed' ? 'text-error' : ''}>{when}</span>
            {c && (
              <span className="text-xs text-gray-500">
                {t('syncCounts', {
                  created: c.created,
                  updated: c.updated,
                  skipped: c.skipped,
                  hidden: c.hidden,
                })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'sync',
      header: t('sync'),
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={r.supported === false || syncSource.isPending}
          title={r.supported === false ? t('sourceNotReadyHint') : undefined}
          onClick={() => syncSource.mutate(r.id)}
        >
          ↻
        </Button>
      ),
    },
    {
      key: 'createdAt',
      header: t('created'),
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
    },
  ];

  const docColumns: Column<KnowledgeDocument>[] = [
    {
      key: 'title',
      header: t('title_column'),
      render: (r) => (
        <button
          type="button"
          className="text-left font-medium text-primary-600 hover:underline"
          onClick={() => setDetailId(r.id)}
        >
          {r.title}
        </button>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      render: (r) => (r.category ? <Badge tone="info">{r.category}</Badge> : '—'),
    },
    {
      key: 'active',
      header: t('active'),
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={updateDocument.isPending}
          onClick={() => toggleActive(r)}
        >
          <Badge tone={r.active === 1 ? 'success' : 'warning'}>
            {r.active === 1 ? t('visible') : t('hidden')}
          </Badge>
        </Button>
      ),
    },
    {
      key: 'source',
      header: t('sourceColumn'),
      // The field was always in the payload but never rendered, so an admin
      // could not tell a knowledge-store entry from an imported Drive doc.
      render: (r) => <Badge tone="gray">{t(`source.${r.source}`, { defaultValue: r.source })}</Badge>,
    },
    { key: 'status', header: t('status'), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'updatedAt',
      header: t('updated'),
      render: (r) => (
        <span className="flex items-center gap-1">
          {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
          {r.stale && <Badge tone="warning">{t('staleBadge')}</Badge>}
        </span>
      ),
    },
    {
      key: 'link',
      header: '',
      // Shortcut straight to the shop page. Only documents that carry a URL
      // show one — policy documents currently have none.
      render: (r) =>
        r.sourceUrl ? (
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t('openProductPage')}
            className="text-gray-400 hover:text-primary-600"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button
          variant="danger"
          size="sm"
          disabled={deleteDocument.isPending}
          onClick={() => removeDoc(r.id)}
        >
          {tc('delete')}
        </Button>
      ),
    },
  ];

  const docList = documents.data;

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
        <Card
          title={t('sources')}
          action={<Button onClick={() => setSourceOpen(true)}>{t('addSource')}</Button>}
        >
          <Table<KnowledgeSource>
            columns={sourceColumns}
            data={sources.data}
            loading={sources.isLoading}
            error={sources.error ? (sources.error as Error).message : null}
            emptyMessage={t('noSources')}
            rowKey={(r) => r.id}
          />
        </Card>

        <Card
          title={t('documents')}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCatalogOpen(true)}>
                {t('syncCatalog')}
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                {t('importProducts')}
              </Button>
              <Button onClick={() => setDocOpen(true)}>{t('addDocument')}</Button>
            </div>
          }
        >
          {/* Group tabs sit above the category navigator: ProductInfo and
              CounselInfo answer different kinds of question, and mixing their
              category lists made neither readable. */}
          <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200">
            {[
              { key: '', label: t('group.all'), count: Object.values(groupTotals).reduce((a, b) => a + b, 0) },
              { key: 'counsel', label: t('group.counsel'), count: groupTotals.counsel ?? 0 },
              { key: 'product', label: t('group.product'), count: groupTotals.product ?? 0 },
            ].map((g) => (
              <button
                key={g.key || 'all'}
                type="button"
                onClick={() => selectGroup(g.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  group === g.key
                    ? 'border-primary-600 font-medium text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {g.label} <span className="ml-1 tabular-nums text-xs text-gray-400">{g.count}</span>
              </button>
            ))}
          </div>

          {/* Category navigator (PLN-Knowledge-QA F3) replaces the old dropdown:
              the whole taxonomy and its sizes are visible at a glance. */}
          <div className="flex flex-col gap-4 md:flex-row">
            <nav className="flex shrink-0 flex-row flex-wrap gap-1 md:w-52 md:flex-col md:flex-nowrap">
              <CategoryLink
                label={t('allCategories')}
                count={categoryTotal}
                selected={category === ''}
                onSelect={() => selectCategory('')}
              />
              {mergedCategories.map((c) => (
                <CategoryLink
                  key={c.category ?? 'uncategorized'}
                  label={c.category ?? t('uncategorized')}
                  count={c.total}
                  inactive={c.total - c.active}
                  selected={category === (c.category ?? '')}
                  onSelect={() => selectCategory(c.category ?? '')}
                />
              ))}
            </nav>

            <div className="min-w-0 flex-1">
              <Table<KnowledgeDocument>
                columns={docColumns}
                data={docList?.items}
                loading={documents.isLoading}
                error={documents.error ? (documents.error as Error).message : null}
                emptyMessage={t('noDocuments')}
                rowKey={(r) => r.id}
              />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={docList?.total ?? 0}
                onPageChange={setPage}
              />
            </div>
          </div>
        </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <KnowledgeQaPanel onEditSource={(id) => { setDetailId(id); setEditing(true); }} />
          {/* Conflict review sits beside QA on purpose: the QA panel is where a
              contradiction shows up, and this is where it gets settled. */}
          <ConflictReview onOpenDocument={(id) => setDetailId(id)} />
        </div>
      </div>

      {/* Catalogue → knowledge (PLN-260807 P1). Preview first: the run rewrites
          the product half of the knowledge base and issues embedding calls, so
          a human sees the plan — including which products merged — before it
          lands. */}
      <Modal
        open={catalogOpen}
        onClose={() => {
          setCatalogOpen(false);
          syncCatalog.reset();
        }}
        title={t('catalogSyncTitle')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCatalogOpen(false);
                syncCatalog.reset();
              }}
            >
              {tc('close')}
            </Button>
            {job?.status !== 'succeeded' && (
              <Button
                disabled={
                  !catalogPreview.data || syncCatalog.isPending || jobRunning || nothingToApply
                }
                onClick={() => syncCatalog.mutate()}
              >
                {syncCatalog.isPending || jobRunning ? t('catalogRunning') : t('catalogRun')}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {catalogPreview.isPending && <p className="text-gray-500">{tc('loading')}</p>}
          {catalogPreview.error && (
            <p className="text-red-600">{(catalogPreview.error as Error).message}</p>
          )}

          {catalogPreview.data && !job && (
            <>
              <p className="text-gray-700">
                {t('catalogSyncIntro', { scanned: catalogPreview.data.scanned })}
              </p>
              <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {[
                  ['catalogCreated', catalogPreview.data.created],
                  ['catalogUpdated', catalogPreview.data.updated],
                  ['catalogCuratedKept', catalogPreview.data.curatedKept],
                  ['catalogAbsorbed', catalogPreview.data.absorbed],
                  ['catalogUnchanged', catalogPreview.data.unchanged],
                  ['catalogHeld', catalogPreview.data.held],
                ].map(([key, value]) => (
                  <div key={key as string} className="flex justify-between px-3 py-1.5">
                    <dt className="text-gray-600">{t(key as string)}</dt>
                    <dd className="font-medium tabular-nums">{value as number}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-gray-500">
                {t('catalogEmbedEstimate', {
                  batches: Math.ceil(
                    (catalogPreview.data.created + catalogPreview.data.updated) / 64,
                  ),
                })}
              </p>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('catalogCuratedHint')}
              </p>

              {catalogPreview.data.familySamples.length > 0 && (
                <details className="rounded-lg border border-gray-200 px-3 py-2">
                  <summary className="cursor-pointer text-gray-700">
                    {t('catalogMergeSamples')}
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {catalogPreview.data.familySamples.map((f) => (
                      <li key={f.representative} className="text-xs">
                        <span className="font-medium text-gray-800">{f.representative}</span>
                        <span className="ml-1 text-gray-500">
                          {t('catalogMergedInto', { count: f.absorbed })}
                        </span>
                        <ul className="mt-0.5 list-disc pl-5 text-gray-500">
                          {f.variants.map((v) => (
                            <li key={v}>{v}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {catalogPreview.data.held > 0 && (
                <details className="rounded-lg border border-gray-200 px-3 py-2">
                  <summary className="cursor-pointer text-gray-700">{t('catalogHeldList')}</summary>
                  <p className="mt-1 text-xs text-gray-500">{t('catalogHeldHint')}</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                    {catalogPreview.data.heldSamples.map((h) => (
                      <li key={h.handle}>{h.title}</li>
                    ))}
                  </ul>
                </details>
              )}

              {nothingToApply && <p className="text-gray-500">{t('catalogNothingToDo')}</p>}
            </>
          )}

          {job && (
            <div className="space-y-3">
              {/* Progress, not a spinner: the run is minutes long and the
                  operator needs to see it move (RPT-260808 D3). */}
              {job.status === 'running' && (
                <div className="space-y-2">
                  <Progress
                    label={t('catalogPhaseWriting')}
                    done={job.written}
                    total={job.writeTotal}
                  />
                  <Progress
                    label={t('catalogPhaseEmbedding')}
                    done={job.embedded}
                    total={job.embedTotal}
                  />
                  <p className="text-xs text-gray-500">{t('catalogKeepOpenHint')}</p>
                </div>
              )}

              {job.status === 'failed' && (
                <p className="text-red-600">
                  {t('catalogFailed')}: {job.error}
                </p>
              )}

              {job.status === 'succeeded' && job.result && (
                <>
                  <p className="font-medium text-gray-800">{t('catalogDone')}</p>
                  <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {[
                      ['catalogCreated', job.result.created],
                      ['catalogUpdated', job.result.updated],
                      ['catalogCuratedKept', job.result.curatedKept],
                      ['catalogHeld', job.result.held],
                      ['importEmbedded', job.result.embedded],
                    ].map(([key, value]) => (
                      <div key={key as string} className="flex justify-between px-3 py-1.5">
                        <dt className="text-gray-600">{t(key as string)}</dt>
                        <dd className="font-medium tabular-nums">{value as number}</dd>
                      </div>
                    ))}
                  </dl>
                  {job.result.embedFailed > 0 && (
                    <p className="text-red-600">
                      {t('catalogNotIndexed')}: {job.result.embedFailed}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportFile(null);
          importProducts.reset();
        }}
        title={t('importProducts')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setImportOpen(false);
                setImportFile(null);
                importProducts.reset();
              }}
            >
              {tc('close')}
            </Button>
            <Button
              disabled={!importFile || importProducts.isPending}
              onClick={() => importFile && importProducts.mutate(importFile)}
            >
              {importProducts.isPending ? tc('loading') : t('import')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:text-white"
          />
          <p className="text-xs text-gray-500">{t('importRequiredColumns')}</p>
          <p className="text-xs text-gray-500">{t('importUpsertHint')}</p>
          <p className="text-xs text-warning">{t('importPriceNote')}</p>

          {importProducts.data && (
            <dl className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-xs">
              <Stat label={t('importParsed')} value={importProducts.data.parsed} />
              <Stat label={t('importCreated')} value={importProducts.data.created} />
              <Stat label={t('importUpdated')} value={importProducts.data.updated} />
              <Stat label={t('importSkipped')} value={importProducts.data.skipped} />
              <Stat label={t('importInvalid')} value={importProducts.data.invalid} />
              <Stat label={t('importEmbedded')} value={importProducts.data.embedded} />
            </dl>
          )}
          {(importProducts.data?.errors.length ?? 0) > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-warning/40 bg-amber-50 p-2 text-xs">
              {importProducts.data!.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  {t('importRow', { n: e.row })}: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={sourceOpen}
        onClose={closeSource}
        title={t('addSource')}
        footer={
          <>
            <Button variant="ghost" onClick={closeSource}>
              {tc('cancel')}
            </Button>
            <Button onClick={saveSource} disabled={createSource.isPending || !sourceName}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('name')}>
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
        </FormRow>
        <FormRow label={t('type')}>
          <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            {SOURCE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </FormRow>
      </Modal>

      <Modal
        open={docOpen}
        onClose={closeDoc}
        title={t('addDocument')}
        footer={
          <>
            <Button variant="ghost" onClick={closeDoc}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={saveDoc}
              disabled={createDocument.isPending || !docTitle || !docCategory || !docContent}
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('title_column')}>
          <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
        </FormRow>
        <FormRow label={t('category')}>
          <>
            <Input
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
              list="kb-categories"
              placeholder={t('categoryPlaceholder')}
            />
            <datalist id="kb-categories">
              {categorySuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        </FormRow>
        <FormRow label={t('content')}>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            rows={8}
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
          />
        </FormRow>
      </Modal>

      <Modal
        open={detailId !== null}
        onClose={closeDetail}
        title={detail.data?.title ?? t('documentDetail')}
        footer={
          <>
            {detail.data && !editing && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  {tc('edit')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={updateDocument.isPending}
                  onClick={() => toggleActive(detail.data)}
                >
                  {detail.data.active === 1 ? t('deactivate') : t('activate')}
                </Button>
              </>
            )}
            {detail.data && editing && (
              <Button onClick={saveEdit} disabled={updateDocument.isPending || !editTitle.trim()}>
                {tc('save')}
              </Button>
            )}
            <Button variant="ghost" onClick={editing ? () => setEditing(false) : closeDetail}>
              {editing ? tc('cancel') : tc('close')}
            </Button>
          </>
        }
      >
        {detail.isLoading ? (
          <p className="py-6 text-center text-sm text-gray-500">{tc('loading')}</p>
        ) : detail.error ? (
          <p className="py-6 text-center text-sm text-error">{(detail.error as Error).message}</p>
        ) : detail.data ? (
          <div className="space-y-3">
            <div className="flex gap-1 border-b border-gray-200">
              {(['content', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                  className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
                    detailTab === tab
                      ? 'border-primary-600 font-medium text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t(`detailTab.${tab}`)}
                </button>
              ))}
            </div>
            {detailTab === 'history' ? (
              <RevisionHistory
                documentId={detail.data.id}
                currentContent={detail.data.content ?? ''}
              />
            ) : (
            <>
            <div className="flex flex-wrap items-center gap-2">
              {detail.data.category && <Badge tone="info">{detail.data.category}</Badge>}
              <Badge tone={detail.data.active === 1 ? 'success' : 'warning'}>
                {detail.data.active === 1 ? t('visible') : t('hidden')}
              </Badge>
              <StatusBadge status={detail.data.status} />
              <Badge tone="gray">
                {t(`source.${detail.data.source}`, { defaultValue: detail.data.source })}
              </Badge>
              {detail.data.stale && <Badge tone="warning">{t('staleBadge')}</Badge>}
              {detail.data.sourceUrl && (
                <a
                  href={detail.data.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('openProductPage')}
                </a>
              )}
              {detail.data.updatedAt && (
                <span className="text-xs text-gray-500">
                  {t('updated')}: {new Date(detail.data.updatedAt).toLocaleString()}
                </span>
              )}
            </div>

            {/* Review state. `updatedAt` moves for any edit, including one that
                never revisited the facts, so it cannot answer "is this still
                true?" — that is what the review stamp is for. */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
              <span>
                {t('reviewedAt')}:{' '}
                {detail.data.reviewedAt
                  ? new Date(detail.data.reviewedAt).toLocaleDateString()
                  : t('neverReviewed')}
              </span>
              {detail.data.reviewDueAt && (
                <span>
                  {t('reviewDue')}: {new Date(detail.data.reviewDueAt).toLocaleDateString()}
                </span>
              )}
              {detail.data.supersededBy && (
                <Badge tone="warning">
                  {t('supersededBy', { id: String(detail.data.supersededBy).slice(0, 8) })}
                </Badge>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                disabled={markReviewed.isPending}
                onClick={() => markReviewed.mutate(detail.data!.id)}
              >
                {t('markReviewed')}
              </Button>
            </div>
            {editing ? (
              /* Saving re-embeds when the content changed (updateDocument), so a
                 corrected source is searchable again straight away. */
              <div className="space-y-2">
                <FormRow label={t('title_column')}>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </FormRow>
                <FormRow label={t('category')}>
                  <>
                    <Input
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      list="kb-categories-edit"
                    />
                    <datalist id="kb-categories-edit">
                      {categorySuggestions.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                </FormRow>
                <FormRow label={t('sourceUrl')}>
                  <Input
                    value={editSourceUrl}
                    placeholder="https://…"
                    onChange={(e) => setEditSourceUrl(e.target.value)}
                  />
                </FormRow>
                <div className="grid grid-cols-2 gap-2">
                  <FormRow label={t('effectiveFrom')}>
                    <Input
                      type="date"
                      value={editEffectiveFrom}
                      onChange={(e) => setEditEffectiveFrom(e.target.value)}
                    />
                  </FormRow>
                  <FormRow label={t('reviewInterval')}>
                    <Input
                      type="number"
                      min={0}
                      value={editReviewDays}
                      placeholder="180"
                      onChange={(e) => setEditReviewDays(e.target.value)}
                    />
                  </FormRow>
                </div>
                <FormRow label={t('content')}>
                  <textarea
                    className="h-64 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                </FormRow>
                <p className="text-[11px] text-gray-400">{t('editReindexHint')}</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed">
                {detail.data.content ?? t('noContent')}
              </div>
            )}
            </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** One row in the category navigator: name, size, and how many are hidden. */
function CategoryLink({
  label,
  count,
  inactive,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  inactive?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm',
        selected ? 'bg-primary-500/10 font-medium text-primary-600' : 'text-gray-600 hover:bg-gray-50',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-gray-400">
        {count}
        {inactive ? ` (−${inactive})` : ''}
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="tabular-nums font-medium text-gray-800">{value}</dd>
    </div>
  );
}
