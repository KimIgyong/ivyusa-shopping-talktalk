import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, Pencil, RefreshCw } from 'lucide-react';
import { Card } from '@/components/Card';
import { Input } from '@/components/Field';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Select } from '@/components/Field';
import { Pagination } from '@/components/Pagination';
import {
  useRejudgeConflict,
  useUpdateDocument,
  useConflicts,
  useDismissConflict,
  useResolveConflict,
  useRetryConflict,
  useScanConflicts,
} from './knowledge.hooks';
import type { ConflictDoc, KnowledgeConflict } from './knowledge.service';

const PAGE_SIZE = 10;

const VERDICT_TONE: Record<string, 'error' | 'warning' | 'info'> = {
  conflict: 'error',
  duplicate: 'warning',
  complementary: 'info',
};

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

/**
 * Conflict review (PLN S4). Similarity narrows the field, the model judges
 * whether the pair actually contradicts, and this screen is stage three: a
 * person decides which document to follow. Choosing a side hides the other,
 * which is what the retriever honours — so the decision changes answers, not
 * just the console.
 */
export function ConflictReview({ onOpenDocument }: { onOpenDocument: (id: string) => void }) {
  const { t } = useTranslation('knowledge');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useConflicts({ status, page, size: PAGE_SIZE });
  // Failures are fetched separately and pinned above the queue: they are not
  // review items, but leaving them invisible is what made 11 pairs vanish with
  // no trace on screen.
  const failures = useConflicts({ status: 'failed', page: 1, size: 20 });
  const scan = useScanConflicts();
  const resolve = useResolveConflict();
  const dismiss = useDismissConflict();
  const retry = useRetryConflict();
  const rejudge = useRejudgeConflict();

  const busy = resolve.isPending || dismiss.isPending;
  const failed = status === 'failed' ? [] : (failures.data?.items ?? []);

  return (
    <Card
      title={t('conflicts.title', { count: data?.total ?? 0 })}
      action={
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="pending">{t('conflicts.statusPending')}</option>
            <option value="resolved">{t('conflicts.statusResolved')}</option>
            <option value="dismissed">{t('conflicts.statusDismissed')}</option>
            <option value="failed">{t('conflicts.statusFailed')}</option>
          </Select>
          <Button size="sm" variant="secondary" disabled={scan.isPending} onClick={() => scan.mutate()}>
            <RefreshCw className={`h-4 w-4 ${scan.isPending ? 'animate-spin' : ''}`} />
            {t('conflicts.rescan')}
          </Button>
        </div>
      }
    >
      {failed.length > 0 && (
        <FailureSection items={failed} busy={retry.isPending} onRetry={(id) => retry.mutate(id)} />
      )}

      {isLoading && <p className="py-6 text-sm text-gray-400">{t('conflicts.loading')}</p>}
      {error && <p className="py-6 text-sm text-error">{(error as Error).message}</p>}
      {!isLoading && !error && (data?.items.length ?? 0) === 0 && (
        <p className="py-6 text-sm text-gray-400">{t('conflicts.empty')}</p>
      )}

      <div className="space-y-4">
        {data?.items.map((c) => (
          <ConflictCard
            key={c.id}
            conflict={c}
            busy={busy}
            onOpenDocument={onOpenDocument}
            onResolve={(resolution) => resolve.mutate({ id: c.id, resolution })}
            onDismiss={() => dismiss.mutate(c.id)}
            onRejudge={() => rejudge.mutate(c.id)}
            rejudging={rejudge.isPending}
          />
        ))}
      </div>

      {(data?.total ?? 0) > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      )}
    </Card>
  );
}

function ConflictCard({
  conflict,
  busy,
  onOpenDocument,
  onResolve,
  onDismiss,
  onRejudge,
  rejudging,
}: {
  conflict: KnowledgeConflict;
  busy: boolean;
  onOpenDocument: (id: string) => void;
  onResolve: (resolution: 'kept_a' | 'kept_b' | 'kept_both') => void;
  onDismiss: () => void;
  onRejudge: () => void;
  rejudging: boolean;
}) {
  const { t } = useTranslation('knowledge');
  const pending = conflict.status === 'pending';

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Badge tone={VERDICT_TONE[conflict.verdict ?? ''] ?? 'gray'}>
          {t(`conflicts.verdict.${conflict.verdict}`, { defaultValue: conflict.verdict ?? '—' })}
        </Badge>
        {conflict.similarity !== null && (
          <span className="tabular-nums">
            {t('conflicts.similarity')} {conflict.similarity.toFixed(2)}
          </span>
        )}
        <span className="ml-auto">
          {t('conflicts.detected')} {fmtDate(conflict.detectedAt)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DocSide label="A" doc={conflict.docA} onOpen={onOpenDocument} />
        <DocSide label="B" doc={conflict.docB} onOpen={onOpenDocument} />
      </div>

      {conflict.rationale && (
        <p className="mt-2 rounded bg-gray-50 p-2 text-sm text-gray-700">
          <span className="font-medium">{t('conflicts.rationale')}:</span> {conflict.rationale}
        </p>
      )}
      {!conflict.rationale && conflict.rationaleWithheld && (
        <p className="mt-2 rounded border border-warning/40 bg-amber-50 p-2 text-xs text-gray-700">
          ⚠ {t('conflicts.rationaleWithheld')}
        </p>
      )}

      {pending ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => onResolve('kept_a')}>
            {t('conflicts.keepA')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onResolve('kept_b')}>
            {t('conflicts.keepB')}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onResolve('kept_both')}>
            {t('conflicts.keepBoth')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
            {t('conflicts.dismiss')}
          </Button>
          <Button size="sm" variant="ghost" disabled={rejudging} onClick={onRejudge}>
            <RefreshCw className={`h-3.5 w-3.5 ${rejudging ? 'animate-spin' : ''}`} />
            {t('conflicts.rejudge')}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          {t(`conflicts.resolution.${conflict.resolution ?? conflict.status}`, {
            defaultValue: conflict.status,
          })}
          {' · '}
          {fmtDate(conflict.resolvedAt)}
        </p>
      )}
    </div>
  );
}

/** Longer bodies collapse rather than being truncated server-side. */
const COLLAPSE_CHARS = 400;

function DocSide({
  label,
  doc,
  onOpen,
}: {
  label: string;
  doc: ConflictDoc | null;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');
  const update = useUpdateDocument();

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(false);

  if (!doc) return <div className="rounded border border-gray-100 p-2 text-sm text-gray-400">—</div>;

  const startEdit = () => {
    setTitle(doc.title);
    setCategory(doc.category ?? '');
    setContent(doc.content);
    setEditing(true);
  };

  const save = () => {
    update.mutate(
      { id: doc.id, body: { title, category, content } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const long = doc.content.length > COLLAPSE_CHARS;
  const shown = expanded || !long ? doc.content : doc.content.slice(0, COLLAPSE_CHARS) + '…';

  return (
    <div className="rounded border border-gray-100 p-2">
      <div className="mb-1 flex items-start gap-1.5">
        <span className="mt-0.5 rounded bg-gray-100 px-1 text-[11px] font-medium text-gray-600">
          {label}
        </span>
        {editing ? (
          <span className="min-w-0 flex-1 text-sm font-medium text-gray-800">{t('editing')}</span>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(doc.id)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:text-primary-700"
          >
            {doc.title}
          </button>
        )}
        {doc.sourceUrl && !editing && (
          <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary-600">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {editing ? (
          <span className="flex gap-1">
            <Button size="sm" disabled={update.isPending || !title.trim()} onClick={save}>
              {tc('save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {tc('cancel')}
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
        <Badge tone="gray">{t(`source.${doc.source}`, { defaultValue: doc.source })}</Badge>
        {doc.effectiveFrom && <span>{t('conflicts.effective')} {fmtDate(doc.effectiveFrom)}</span>}
        <span>{t('conflicts.updated')} {fmtDate(doc.updatedAt)}</span>
        {doc.stale && (
          <span className="flex items-center gap-0.5 text-warning">
            <AlertTriangle className="h-3 w-3" />
            {t('conflicts.stale')}
          </span>
        )}
        {!doc.active && <Badge tone="gray">{t('conflicts.hidden')}</Badge>}
      </div>

      {editing ? (
        /* Edits happen inside the card so the other document stays on screen —
           the comparison is the whole reason this screen exists. Saving
           re-embeds when the body changed, so retrieval reflects it at once. */
        <div className="space-y-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('title_column')} />
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('category')} />
          <textarea
            className="h-40 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-primary-500"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-[10px] text-gray-400">{t('editReindexHint')}</p>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-xs text-gray-600">{shown}</p>
          {long && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? t('conflicts.collapse') : t('conflicts.more')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Pairs the model never produced a usable verdict for. Not review items — they
 * carry no judgement — but they must be visible: silently dropping them meant
 * eleven candidate pairs disappeared with nothing on screen to explain it.
 */
function FailureSection({
  items,
  busy,
  onRetry,
}: {
  items: KnowledgeConflict[];
  busy: boolean;
  onRetry: (id: string) => void;
}) {
  const { t } = useTranslation('knowledge');
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 1);

  return (
    <div className="mb-4 rounded-lg border border-warning/40 bg-amber-50/60 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <span className="font-medium">{t('conflicts.failedTitle', { count: items.length })}</span>
      </div>

      <div className="space-y-2">
        {shown.map((c) => (
          <div key={c.id} className="rounded border border-gray-200 bg-white p-2 text-xs">
            <div className="mb-1 truncate text-gray-800">
              {c.docA?.title ?? '—'} <span className="text-gray-400">↔</span> {c.docB?.title ?? '—'}
              {c.similarity !== null && (
                <span className="ml-1 tabular-nums text-gray-400">{c.similarity.toFixed(2)}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-gray-500">
              <Badge tone="warning">
                {t(`conflicts.failure.${c.failureReason}`, { defaultValue: c.failureReason ?? '—' })}
              </Badge>
              <span>{t('conflicts.attempts', { n: c.attempts ?? 0 })}</span>
              {c.lastAttemptAt && <span>{fmtDate(c.lastAttemptAt)}</span>}
              {c.retriesLeft === 0 && <Badge tone="gray">{t('conflicts.retriesExhausted')}</Badge>}
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                disabled={busy}
                onClick={() => onRetry(c.id)}
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t('conflicts.retry')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setOpen(!open)}>
          {open ? t('conflicts.collapse') : t('conflicts.expandMore', { n: items.length - 1 })}
        </Button>
      )}
    </div>
  );
}
