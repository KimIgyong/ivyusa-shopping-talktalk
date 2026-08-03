import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { FormRow, Input, Select } from '@/components/Field';
import { cn } from '@/lib/cn';
import { KnowledgeQaPanel } from './KnowledgeQaPanel';
import {
  useCategories,
  useSources,
  useCreateSource,
  useSetSourceStatus,
  useDocuments,
  useDocument,
  useCreateDocument,
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

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const documents = useDocuments({ page, size: PAGE_SIZE, category: category || undefined });
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();

  const categories = useCategories();
  const categoryTotal = (categories.data ?? []).reduce((sum, c) => sum + c.total, 0);
  // Suggest what this tenant actually uses, plus the known taxonomy for a tenant
  // that has not created anything yet.
  const categorySuggestions = [
    ...new Set([
      ...(categories.data ?? []).map((c) => c.category).filter((c): c is string => !!c),
      ...CATEGORIES,
    ]),
  ];
  const selectCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useDocument(detailId);
  // Edit mode for the detail modal — also entered directly from a QA source.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editContent, setEditContent] = useState('');

  // Load the fetched document into the edit fields whenever it changes.
  useEffect(() => {
    if (detail.data) {
      setEditTitle(detail.data.title);
      setEditCategory(detail.data.category ?? '');
      setEditContent(detail.data.content ?? '');
    }
  }, [detail.data]);

  const closeDetail = () => {
    setDetailId(null);
    setEditing(false);
  };

  const saveEdit = () => {
    if (!detail.data) return;
    updateDocument.mutate(
      {
        id: detail.data.id,
        body: { title: editTitle, category: editCategory, content: editContent },
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);

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
      render: (r) => (
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
    { key: 'status', header: t('status'), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'updatedAt',
      header: t('updated'),
      render: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'),
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
          action={<Button onClick={() => setDocOpen(true)}>{t('addDocument')}</Button>}
        >
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
              {(categories.data ?? []).map((c) => (
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

        <div className="xl:sticky xl:top-6 xl:self-start">
          <KnowledgeQaPanel onEditSource={(id) => { setDetailId(id); setEditing(true); }} />
        </div>
      </div>

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
            <div className="flex flex-wrap items-center gap-2">
              {detail.data.category && <Badge tone="info">{detail.data.category}</Badge>}
              <Badge tone={detail.data.active === 1 ? 'success' : 'warning'}>
                {detail.data.active === 1 ? t('visible') : t('hidden')}
              </Badge>
              <StatusBadge status={detail.data.status} />
              {detail.data.updatedAt && (
                <span className="text-xs text-gray-500">
                  {t('updated')}: {new Date(detail.data.updatedAt).toLocaleString()}
                </span>
              )}
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
