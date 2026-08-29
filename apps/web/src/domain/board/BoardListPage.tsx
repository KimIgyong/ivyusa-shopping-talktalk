import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Input, Select } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { toast } from '@/store/toast-store';
import { useBoardCategoryCounts, useBoardDocuments, useBoardMentions, useFaqImport } from './board.hooks';
import type { BoardDocumentSummary } from './board.service';

const GROUPS = ['counsel', 'product', 'operation'] as const;

/** Smart Knowledge Board list (PLN-260829 B1 §3). */
export function BoardListPage() {
  const { t } = useTranslation('board');
  const { t: tk } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const [group, setGroup] = useState('');
  const [category1, setCategory1] = useState('');
  const [category2, setCategory2] = useState('');
  const [tag, setTag] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(1);

  const mentionsQ = useBoardMentions();
  const [mentionsOpen, setMentionsOpen] = useState(false);

  const faqImport = useFaqImport();
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqGroup, setFaqGroup] = useState('counsel');
  const [faqFile, setFaqFile] = useState<File | null>(null);
  const closeFaq = () => {
    setFaqOpen(false);
    setFaqFile(null);
    faqImport.reset();
  };
  const runFaqImport = () => {
    if (!faqFile) return;
    faqImport.mutate(
      { file: faqFile, docGroup: faqGroup },
      {
        onSuccess: (r) => {
          if (r.invalid > 0) {
            toast.warning(
              `${t('faqImportDone', { created: r.created, skipped: r.skipped })} · ${t('faqImportInvalid')} ${r.invalid}`,
            );
          } else {
            toast.success(t('faqImportDone', { created: r.created, skipped: r.skipped }));
          }
        },
        onError: (err: Error & { code?: string }) => {
          const known = err.code && ['E5061', 'E5062', 'E5063', 'E5064', 'E5065'].includes(err.code);
          toast.error(known ? tk(`bulkImportError.${err.code}`) : err.message);
        },
      },
    );
  };

  const documents = useBoardDocuments({
    group: group || undefined,
    category1: category1 || undefined,
    category2: category2 || undefined,
    tag: tag || undefined,
    status: statusFilter || undefined,
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
        action={
          <div className="relative flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMentionsOpen((v) => !v)}>
              @{t('mentionsMe')}
              <span className="ml-1 tabular-nums">{mentionsQ.data?.length ?? 0}</span>
            </Button>
            {mentionsOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-96 rounded-md border border-gray-200 bg-white p-2 text-sm shadow-lg">
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {(mentionsQ.data ?? []).map((m) => (
                    <li key={m.id} className="border-b border-gray-100 pb-1.5 last:border-0">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => navigate(`/knowledge/board/${m.documentId}`)}
                      >
                        <span className="block truncate text-xs font-medium text-primary-700">
                          {m.documentTitle}
                        </span>
                        <span className="block truncate text-xs text-gray-600">{m.body}</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!mentionsQ.data?.length && (
                    <li className="py-2 text-xs text-gray-400">{t('noMentions')}</li>
                  )}
                </ul>
              </div>
            )}
            <Button variant="secondary" onClick={() => setFaqOpen(true)}>
              {t('faqImport')}
            </Button>
            <Button onClick={() => navigate('/knowledge/board/new')}>{t('newDocument')}</Button>
          </div>
        }
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
            <div className="mt-3 flex flex-wrap gap-1">
              {['', 'draft', 'published', 'promoted', 'rejected'].map((st) => (
                <button
                  key={st || 'all'}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st);
                    setPage(1);
                  }}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    statusFilter === st
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st ? t(`statusValue.${st}`) : t('statusAll')}
                </button>
              ))}
            </div>
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

      <Modal
        open={faqOpen}
        onClose={closeFaq}
        title={t('faqImport')}
        footer={
          <>
            <Button variant="ghost" onClick={closeFaq}>
              {tc('close')}
            </Button>
            <Button disabled={!faqFile || faqImport.isPending} onClick={runFaqImport}>
              {faqImport.isPending ? tc('loading') : t('faqImportRun')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">{t('faqImportHint')}</p>
          <div className="flex gap-3">
            <a
              className="text-sm font-medium text-primary hover:underline"
              href="/samples/board-faq-import-sample.csv"
              download
            >
              ⬇ {t('faqImportSampleCsv')}
            </a>
            <a
              className="text-sm font-medium text-primary hover:underline"
              href="/samples/board-faq-import-sample.xlsx"
              download
            >
              ⬇ {t('faqImportSampleXlsx')}
            </a>
          </div>
          <p className="text-xs text-gray-500">{t('faqImportColumns')}</p>
          <p className="text-xs text-gray-500">{t('faqImportOptional')}</p>
          <p className="text-xs text-gray-500">{t('faqImportDupNote')}</p>
          <Select value={faqGroup} onChange={(e) => setFaqGroup(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {tk(`group.${g}`)}
              </option>
            ))}
          </Select>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFaqFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:text-white"
          />

          {faqImport.data && (
            <dl className="grid grid-cols-4 gap-2 rounded-lg bg-gray-50 p-3 text-xs">
              <FaqStat label={t('faqImportParsed')} value={faqImport.data.parsed} />
              <FaqStat label={t('faqImportCreated')} value={faqImport.data.created} />
              <FaqStat label={t('faqImportSkipped')} value={faqImport.data.skipped} />
              <FaqStat label={t('faqImportInvalid')} value={faqImport.data.invalid} />
            </dl>
          )}
          {(faqImport.data?.errors.length ?? 0) > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-warning/40 bg-amber-50 p-2 text-xs">
              {faqImport.data!.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  {t('faqImportRow', { n: e.row })}: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

function FaqStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
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
