import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { History, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { apiGet } from '@/lib/api-client';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

interface RevisionSummary {
  id: number;
  revisionNo: number;
  kind: 'baseline' | 'manual' | 'coaching' | 'revert';
  changedFields: string[];
  note: string | null;
  proposalId: number | null;
  actorUserId: number | null;
  createdAt: string;
}

interface Revision extends RevisionSummary {
  persona: string | null;
  rules: string[];
}

interface ConfigHistorySectionProps {
  /** Load a past version into the editors above — review then save, never live. */
  onRestore: (draft: { persona: string; rules: string[] }) => void;
}

/**
 * Version history for the persona and response rules (FR-073).
 *
 * Restoring deliberately does not write: it fills the editors and stops, so a
 * version from three months ago goes live only after a human has looked at it
 * and pressed save — the restore-as-draft pattern Zendesk and Intercom both use.
 */
export function ConfigHistorySection({ onRestore }: ConfigHistorySectionProps) {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const tenantKey = useTenantKey();
  const [viewing, setViewing] = useState<Revision | null>(null);

  const list = useQuery({
    queryKey: ['ai-config', tenantKey, 'revisions'],
    queryFn: () => apiGet<{ items: RevisionSummary[] }>('/ai-config/revisions'),
  });

  const open = useMutation({
    mutationFn: (id: number) => apiGet<Revision>(`/ai-config/revisions/${id}`),
    onSuccess: (r) => setViewing(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const items = list.data?.items ?? [];

  function restore() {
    if (!viewing) return;
    onRestore({ persona: viewing.persona ?? '', rules: viewing.rules });
    setViewing(null);
    toast.success(t('history.toastLoaded'));
  }

  return (
    <Card title={t('history.title')}>
      <p className="mb-3 text-xs text-gray-400">{t('history.hint')}</p>

      {list.isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
      {!list.isLoading && items.length === 0 && (
        <p className="text-sm text-gray-400">{t('history.empty')}</p>
      )}

      <div className="space-y-1.5">
        {items.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="font-mono text-gray-400">#{r.revisionNo}</span>
            <Badge tone={r.kind === 'coaching' ? 'info' : r.kind === 'revert' ? 'warning' : 'gray'}>
              {t(`history.kind_${r.kind}`)}
            </Badge>
            <span className="text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
            {r.changedFields.length > 0 && (
              <span className="text-gray-500">
                {r.changedFields.map((f) => t(`history.field_${f}`, { defaultValue: f })).join(', ')}
              </span>
            )}
            {r.note && <span className="truncate text-gray-500">— {r.note}</span>}
            <button
              type="button"
              disabled={open.isPending}
              onClick={() => open.mutate(r.id)}
              className="ml-auto text-primary-600 hover:underline disabled:opacity-50"
            >
              <History className="mr-0.5 inline h-3 w-3" />
              {t('history.view')}
            </button>
          </div>
        ))}
      </div>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={t('history.viewTitle', { no: viewing?.revisionNo ?? 0 })}
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">{t('history.restoreNotice')}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setViewing(null)}>
                {tc('close')}
              </Button>
              <Button onClick={restore}>
                <RotateCcw className="h-4 w-4" /> {t('history.loadIntoEditor')}
              </Button>
            </div>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-3">
            {viewing.note && <p className="text-xs text-gray-500">— {viewing.note}</p>}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">
                {t('persona')}
              </p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">
                {viewing.persona || '—'}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">
                {t('responseRules')} ({viewing.rules.length})
              </p>
              <ol className="max-h-48 list-decimal space-y-1 overflow-y-auto rounded bg-gray-50 p-2 pl-6 text-xs text-gray-700">
                {viewing.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
