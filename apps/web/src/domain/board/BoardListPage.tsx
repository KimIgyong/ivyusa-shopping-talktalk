import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Input } from '@/components/Field';
import { Pagination } from '@/components/Pagination';
import { useBoardCategoryCounts, useBoardDocuments } from './board.hooks';
import type { BoardDocumentSummary } from './board.service';

const GROUPS = ['counsel', 'product', 'operation'] as const;

/** Smart Knowledge Board list (PLN-260829 B1 §3). */
export function BoardListPage() {
  const { t } = useTranslation('board');
  const { t: tk } = useTranslation('knowledge');
  const navigate = useNavigate();

  const [group, setGroup] = useState('');
  const [category1, setCategory1] = useState('');
  const [category2, setCategory2] = useState('');
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(1);

  const documents = useBoardDocuments({
    group: group || undefined,
    category1: category1 || undefined,
    category2: category2 || undefined,
    tag: tag || undefined,
    search: search || undefined,
    page,
  });
  const counts = useBoardCategoryCounts();

  const visibleCounts = (counts.data ?? []).filter((c) => !group || c.group === group);
  // category1 → { total, children: category2 → total }
  const tree = new Map<string, { total: number; children: Map<string, number> }>();
  for (const c of visibleCounts) {
    const node = tree.get(c.category1) ?? { total: 0, children: new Map() };
    node.total += c.total;
    if (c.category2) node.children.set(c.category2, (node.children.get(c.category2) ?? 0) + c.total);
    tree.set(c.category1, node);
  }
  const groupTotals = (counts.data ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.group] = (acc[c.group] ?? 0) + c.total;
    return acc;
  }, {});

  const selectCategory = (c1: string, c2 = '') => {
    setCategory1(c1);
    setCategory2(c2);
    setPage(1);
  };

  const statusTone = (s: string) =>
    s === 'promoted' ? 'success' : s === 'published' ? 'info' : s === 'rejected' ? 'warning' : 'gray';

  const columns: Column<BoardDocumentSummary>[] = [
    {
      key: 'title',
      header: t('title_column'),
      className: 'w-full',
      render: (r) => (
        <button
          type="button"
          className="text-left font-medium text-primary-600 hover:underline"
          onClick={() => navigate(`/knowledge/board/${r.id}`)}
        >
          {r.title}
        </button>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      className: 'whitespace-nowrap',
      render: (r) => (
        <span className="text-xs text-gray-600">
          {r.category1}
          {r.category2 ? ` › ${r.category2}` : ''}
        </span>
      ),
    },
    {
      key: 'team',
      header: t('team'),
      className: 'whitespace-nowrap',
      render: (r) => (r.teamLabel ? <Badge tone="info">{r.teamLabel}</Badge> : '—'),
    },
    {
      key: 'tags',
      header: t('tags'),
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.tags.slice(0, 3).map((x) => (
            <button
              key={x}
              type="button"
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
              onClick={() => {
                setTag(tag === x ? '' : x);
                setPage(1);
              }}
            >
              #{x}
            </button>
          ))}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: t('updated'),
      className: 'whitespace-nowrap',
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
    {
      key: 'status',
      header: t('status'),
      className: 'whitespace-nowrap',
      render: (r) => <Badge tone={statusTone(r.status)}>{t(`statusValue.${r.status}`)}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Card
        title={t('documents')}
        action={<Button onClick={() => navigate('/knowledge/board/new')}>{t('newDocument')}</Button>}
      >
        <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200">
          {[
            { key: '', label: tk('group.all') },
            ...GROUPS.map((g) => ({ key: g, label: tk(`group.${g}`) })),
          ].map((g) => (
            <button
              key={g.key || 'all'}
              type="button"
              onClick={() => {
                setGroup(g.key);
                selectCategory('');
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                group === g.key
                  ? 'border-primary-600 font-medium text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {g.label}
              <span className="ml-1 text-xs tabular-nums text-gray-400">
                {g.key ? groupTotals[g.key] ?? 0 : Object.values(groupTotals).reduce((a, b) => a + b, 0)}
              </span>
            </button>
          ))}
          <form
            className="ml-auto py-1"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchDraft.trim());
              setPage(1);
            }}
          >
            <Input
              value={searchDraft}
              placeholder={t('searchPlaceholder')}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="h-8 w-52"
            />
          </form>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <nav className="flex shrink-0 flex-row flex-wrap gap-1 md:w-56 md:flex-col md:flex-nowrap">
            <CategoryLink
              label={t('allCategories')}
              count={visibleCounts.reduce((s, c) => s + c.total, 0)}
              selected={category1 === ''}
              onSelect={() => selectCategory('')}
            />
            {[...tree.entries()].map(([c1, node]) => (
              <div key={c1}>
                <CategoryLink
                  label={c1}
                  count={node.total}
                  selected={category1 === c1 && category2 === ''}
                  onSelect={() => selectCategory(c1)}
                />
                {category1 === c1 &&
                  [...node.children.entries()].map(([c2, n]) => (
                    <div key={c2} className="pl-4">
                      <CategoryLink
                        label={c2}
                        count={n}
                        selected={category2 === c2}
                        onSelect={() => selectCategory(c1, c2)}
                      />
                    </div>
                  ))}
              </div>
            ))}
            {tag && (
              <button
                type="button"
                className="mt-2 text-left text-xs text-primary-600 hover:underline"
                onClick={() => setTag('')}
              >
                {t('clearTagFilter', { tag })}
              </button>
            )}
          </nav>

          <div className="min-w-0 flex-1">
            <Table
              columns={columns}
              data={documents.data?.items}
              loading={documents.isLoading}
              error={documents.error ? (documents.error as Error).message : null}
              emptyMessage={t('empty')}
              rowKey={(r) => r.id}
            />
            {documents.data && documents.data.total > documents.data.pageSize && (
              <Pagination
                page={page}
                pageSize={documents.data.pageSize}
                total={documents.data.total}
                onPageChange={setPage}
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function CategoryLink({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
        selected ? 'bg-primary-50 font-medium text-primary-700' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-2 text-xs tabular-nums text-gray-400">{count}</span>
    </button>
  );
}
