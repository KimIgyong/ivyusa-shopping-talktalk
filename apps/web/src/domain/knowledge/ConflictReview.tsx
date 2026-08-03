import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Select } from '@/components/Field';
import { Pagination } from '@/components/Pagination';
import {
  useConflicts,
  useDismissConflict,
  useResolveConflict,
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
  const scan = useScanConflicts();
  const resolve = useResolveConflict();
  const dismiss = useDismissConflict();

  const busy = resolve.isPending || dismiss.isPending;

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
          </Select>
          <Button size="sm" variant="secondary" disabled={scan.isPending} onClick={() => scan.mutate()}>
            <RefreshCw className={`h-4 w-4 ${scan.isPending ? 'animate-spin' : ''}`} />
            {t('conflicts.rescan')}
          </Button>
        </div>
      }
    >
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
}: {
  conflict: KnowledgeConflict;
  busy: boolean;
  onOpenDocument: (id: string) => void;
  onResolve: (resolution: 'kept_a' | 'kept_b' | 'kept_both') => void;
  onDismiss: () => void;
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
  if (!doc) return <div className="rounded border border-gray-100 p-2 text-sm text-gray-400">—</div>;

  return (
    <div className="rounded border border-gray-100 p-2">
      <div className="mb-1 flex items-start gap-1.5">
        <span className="mt-0.5 rounded bg-gray-100 px-1 text-[11px] font-medium text-gray-600">
          {label}
        </span>
        <button
          type="button"
          onClick={() => onOpen(doc.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:text-primary-700"
        >
          {doc.title}
        </button>
        {doc.sourceUrl && (
          <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-primary-600">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
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

      <p className="line-clamp-4 whitespace-pre-wrap text-xs text-gray-600">{doc.excerpt}</p>
    </div>
  );
}
