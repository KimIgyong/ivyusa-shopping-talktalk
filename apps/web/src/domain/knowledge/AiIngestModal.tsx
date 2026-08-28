import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { FormRow, Input, Select } from '@/components/Field';
import { Progress } from '@/components/Progress';
import { toast } from '@/store/toast-store';
import {
  useApproveIngest,
  useIngestFile,
  useIngestStatus,
  useIngestVideo,
} from './knowledge.hooks';
import type { IngestDraft } from './knowledge.service';

/** Codes the ingest pipeline can fail with — localized here (PLN-260829 P3-9). */
const INGEST_ERROR_CODES = ['E5066', 'E5067', 'E5068', 'E5069', 'E5070'];

interface ReviewDraft extends IngestDraft {
  selected: boolean;
  expanded: boolean;
}

/**
 * AI import (PLN-260829 3차): file or YouTube URL → draft articles → operator
 * review → knowledge documents. The review step is the point: nothing the
 * model produced is saved until a person selected it (D4-1).
 */
export function AiIngestModal({
  open,
  onClose,
  defaultGroup,
}: {
  open: boolean;
  onClose: () => void;
  defaultGroup: string;
}) {
  const { t } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');

  const [group, setGroup] = useState(defaultGroup || 'counsel');
  const [mode, setMode] = useState<'file' | 'video'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [drafts, setDrafts] = useState<ReviewDraft[] | null>(null);

  const ingestFile = useIngestFile();
  const ingestVideo = useIngestVideo();
  const approve = useApproveIngest();
  const status = useIngestStatus(open);
  const job = status.data ?? null;

  // The tab the modal was opened from is only the starting value.
  useEffect(() => {
    if (open) setGroup(defaultGroup || 'counsel');
  }, [open, defaultGroup]);

  // Drafts become local, editable state exactly once per ready job.
  useEffect(() => {
    if (job?.status === 'ready' && drafts === null) {
      setDrafts(job.drafts.map((d) => ({ ...d, selected: true, expanded: false })));
    }
  }, [job, drafts]);

  const localizedError = (code: string | null) =>
    code && INGEST_ERROR_CODES.includes(code) ? t(`ingestError.${code}`) : code;

  const start = () => {
    const onError = (err: Error & { code?: string }) =>
      toast.error(localizedError(err.code ?? null) ?? err.message);
    const onSuccess = () => {
      setDrafts(null);
      void status.refetch();
    };
    if (mode === 'file' && file) ingestFile.mutate({ file, docGroup: group }, { onError, onSuccess });
    if (mode === 'video' && videoUrl.trim())
      ingestVideo.mutate({ url: videoUrl.trim(), docGroup: group }, { onError, onSuccess });
  };

  const save = () => {
    const picked = (drafts ?? []).filter((d) => d.selected);
    approve.mutate(
      picked.map((d) => ({ title: d.title, category: d.category, content: d.content })),
      {
        onSuccess: (r) => {
          if (r.embedFailed) {
            toast.error(t('ingestDone', { saved: r.saved, embedded: r.embedded }));
          } else {
            toast.success(t('ingestDone', { saved: r.saved, embedded: r.embedded }));
          }
          setDrafts(null);
          onClose();
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  const patchDraft = (i: number, patch: Partial<ReviewDraft>) =>
    setDrafts((prev) => prev!.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const running = job?.status === 'running';
  const reviewing = job?.status === 'ready' && drafts !== null;
  const failedCode = job?.status === 'failed' ? job.error : null;
  const starting = ingestFile.isPending || ingestVideo.isPending;
  const selectedCount = (drafts ?? []).filter((d) => d.selected).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('aiImport')} — ${t(`group.${group}`)}`}
      footer={
        reviewing ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button disabled={!selectedCount || approve.isPending} onClick={save}>
              {approve.isPending ? tc('loading') : t('ingestSave', { count: selectedCount })}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {tc('close')}
            </Button>
            <Button
              disabled={running || starting || (mode === 'file' ? !file : !videoUrl.trim())}
              onClick={start}
            >
              {running || starting ? tc('loading') : t('ingestStart')}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {!reviewing && (
          <>
            <FormRow label={t('groupColumn')}>
              <Select value={group} onChange={(e) => setGroup(e.target.value)} disabled={running}>
                <option value="counsel">{t('group.counsel')} · {t('ingestGroupCounsel')}</option>
                <option value="product">{t('group.product')} · {t('ingestGroupProduct')}</option>
                <option value="operation">{t('group.operation')} · {t('ingestGroupOperation')}</option>
              </Select>
            </FormRow>

            <div className="flex gap-1 border-b border-gray-200">
              {(['file', 'video'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`-mb-px border-b-2 px-3 py-2 ${
                    mode === m
                      ? 'border-primary-600 font-medium text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t(m === 'file' ? 'ingestFileTab' : 'ingestVideoTab')}
                </button>
              ))}
            </div>

            {mode === 'file' ? (
              <>
                <input
                  type="file"
                  accept=".pdf,.docx,.xlsx,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-2 file:text-sm file:text-white"
                />
                <p className="text-xs text-gray-500">{t('ingestFileHint')}</p>
              </>
            ) : (
              <>
                <Input
                  value={videoUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
                <p className="text-xs text-gray-500">{t('ingestVideoHint')}</p>
              </>
            )}

            {running && (
              <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-600">
                  {job.phase === 'extracting' ? t('ingestExtracting') : t('ingestAnalyzing')}
                  {' — '}
                  {job.sourceLabel}
                </p>
                {job.phase === 'analyzing' && (
                  <Progress label={t('ingestAnalyzing')} done={job.analyzed} total={job.analyzeTotal} />
                )}
              </div>
            )}
            {failedCode && (
              <p className="text-xs text-red-600">{localizedError(failedCode)}</p>
            )}
          </>
        )}

        {reviewing && (
          <>
            <p className="text-xs text-gray-500">
              {t('ingestReviewHint', { source: job.sourceLabel })}
            </p>
            {job.truncated && <p className="text-xs text-warning">{t('ingestTruncated')}</p>}
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {drafts.map((d, i) => (
                <li key={i} className="rounded-md border border-gray-200 p-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={d.selected}
                      aria-label={t('ingestSelectDraft')}
                      onChange={(e) => patchDraft(i, { selected: e.target.checked })}
                    />
                    <Input
                      value={d.title}
                      onChange={(e) => patchDraft(i, { title: e.target.value })}
                      className="flex-1"
                    />
                    {d.fallback && <Badge tone="warning">{t('ingestFallback')}</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-6">
                    <span className="text-xs text-gray-500">{t('category')}</span>
                    <Input
                      value={d.category}
                      onChange={(e) => patchDraft(i, { category: e.target.value })}
                      className="w-48"
                    />
                    <button
                      type="button"
                      className="text-xs text-primary-600 hover:underline"
                      onClick={() => patchDraft(i, { expanded: !d.expanded })}
                    >
                      {d.expanded ? t('ingestHideContent') : t('ingestShowContent')}
                    </button>
                    <span className="ml-auto text-xs tabular-nums text-gray-400">
                      {d.content.length.toLocaleString()}
                    </span>
                  </div>
                  {d.expanded && (
                    <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">
                      {d.content}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
            {!drafts.length && <p className="text-sm text-gray-500">{t('ingestNoDrafts')}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
