import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { useRestoreRevision, useRevision, useRevisions } from './knowledge.hooks';
import type { DocumentRevision } from './knowledge.service';

const KIND_TONE: Record<string, 'gray' | 'info' | 'success' | 'warning'> = {
  baseline: 'gray',
  create: 'success',
  update: 'info',
  restore: 'warning',
  delete: 'warning',
};

function fmt(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Line-level diff. Deliberately not a dependency: bodies average 242 characters
 * and the longest is 914, so an LCS over lines is both sufficient and smaller
 * than any library that would do it for us.
 */
function diffLines(before: string, after: string): Array<{ sign: ' ' | '-' | '+'; text: string }> {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: Array<{ sign: ' ' | '-' | '+'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ sign: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ sign: '-', text: a[i++] });
    } else {
      out.push({ sign: '+', text: b[j++] });
    }
  }
  while (i < a.length) out.push({ sign: '-', text: a[i++] });
  while (j < b.length) out.push({ sign: '+', text: b[j++] });
  return out;
}

/**
 * Change history for a knowledge document (PLN T3). Nothing recorded knowledge
 * edits before this — the documents that ground every AI answer were the one
 * privileged surface with no trail at all.
 */
export function RevisionHistory({
  documentId,
  currentContent,
}: {
  documentId: string;
  currentContent: string;
}) {
  const { t } = useTranslation('knowledge');
  const { data, isLoading, error } = useRevisions(documentId);
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useRevision(documentId, openId);
  const restore = useRestoreRevision();

  if (isLoading) return <p className="py-6 text-sm text-gray-400">{t('history.loading')}</p>;
  if (error) return <p className="py-6 text-sm text-error">{(error as Error).message}</p>;
  if (!data || data.length === 0) {
    return <p className="py-6 text-sm text-gray-400">{t('history.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100">
        {data.map((r) => (
          <Row
            key={r.id}
            rev={r}
            open={openId === r.id}
            onToggle={() => setOpenId(openId === r.id ? null : r.id)}
            onRestore={() => restore.mutate({ documentId, revisionId: r.id })}
            restoring={restore.isPending}
          />
        ))}
      </ul>

      {openId && detail.data && (
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">
            {t('history.compare', { n: detail.data.revisionNo })}
          </p>
          <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-2 text-[11px] leading-relaxed">
            {diffLines(detail.data.content ?? '', currentContent).map((l, i) => (
              <div
                key={i}
                className={
                  l.sign === '-'
                    ? 'bg-red-50 text-red-700'
                    : l.sign === '+'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600'
                }
              >
                {l.sign} {l.text || ' '}
              </div>
            ))}
          </pre>
        </div>
      )}

      <p className="text-[11px] text-gray-400">{t('history.restoreNote')}</p>
    </div>
  );
}

function Row({
  rev,
  open,
  onToggle,
  onRestore,
  restoring,
}: {
  rev: DocumentRevision;
  open: boolean;
  onToggle: () => void;
  onRestore: () => void;
  restoring: boolean;
}) {
  const { t } = useTranslation('knowledge');
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-xs">
      <span className="w-14 shrink-0 font-mono text-gray-500">rev {rev.revisionNo}</span>
      <span className="w-36 shrink-0 tabular-nums text-gray-600">{fmt(rev.createdAt)}</span>
      <span className="w-24 shrink-0 truncate text-gray-700">
        {/* A baseline predates this feature, so no one can be credited with it. */}
        {rev.actorUserId ? `#${rev.actorUserId}` : t('history.systemActor')}
      </span>
      <Badge tone={KIND_TONE[rev.changeKind] ?? 'gray'}>
        {t(`history.kind.${rev.changeKind}`, { defaultValue: rev.changeKind })}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-gray-500">
        {rev.changedFields.map((f) => t(`history.field.${f}`, { defaultValue: f })).join(', ') || '—'}
        {rev.restoredFrom != null && ` (← rev ${rev.restoredFrom})`}
      </span>
      <Button size="sm" variant="ghost" onClick={onToggle}>
        {open ? t('conflicts.collapse') : t('history.view')}
      </Button>
      <Button size="sm" variant="secondary" disabled={restoring} onClick={onRestore}>
        <RotateCcw className="h-3.5 w-3.5" /> {t('history.restore')}
      </Button>
    </li>
  );
}
