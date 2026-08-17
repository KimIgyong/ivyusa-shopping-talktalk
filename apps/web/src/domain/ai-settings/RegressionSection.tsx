import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Field';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';
import { goldenService, type Comparison, type GoldenRun } from './golden.service';
import { ComparisonModal } from './ComparisonModal';

/**
 * Regression set (FR-073). Re-asks a fixed list of questions so a config change
 * can be judged on more than one reply.
 *
 * It reports signals and renders no verdict on purpose: the model rewords the
 * same answer every time, so a diff alone cannot tell an effect from ordinary
 * variance (TCR-260813 §3 O-1). That is what the "measure variance" run is for.
 */
export function RegressionSection() {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const [draft, setDraft] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);

  const questions = useQuery({
    queryKey: ['golden', tenantKey, 'questions'],
    queryFn: goldenService.listQuestions,
  });
  const runs = useQuery({ queryKey: ['golden', tenantKey, 'runs'], queryFn: goldenService.listRuns });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['golden', tenantKey] });
  };

  const add = useMutation({
    mutationFn: () => goldenService.addQuestion({ question: draft.trim() }),
    onSuccess: () => {
      setDraft('');
      invalidate();
      toast.success(t('regression.toastAdded'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => goldenService.removeQuestion(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('regression.toastRemoved'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: (kind: 'manual' | 'noise') => goldenService.createRun(kind),
    onSuccess: (r: GoldenRun) => {
      invalidate();
      toast.success(t('regression.toastRan', { count: r.questionCount }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const compare = useMutation({
    mutationFn: ({ base, target }: { base: number; target: number }) =>
      goldenService.compare(base, target),
    onSuccess: (c) => setComparison(c),
    onError: (e: Error) => toast.error(e.message),
  });

  const items = questions.data?.items ?? [];
  const max = questions.data?.max ?? 20;
  const runList = runs.data?.items ?? [];
  const busy = add.isPending || remove.isPending || run.isPending || compare.isPending;

  /** A run is comparable against the one before it in the list (newest first). */
  const previousOf = (idx: number) => runList[idx + 1];

  return (
    <Card
      title={t('regression.title')}
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run.mutate('noise')}>
            <Repeat className="h-4 w-4" /> {t('regression.measureVariance')}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => run.mutate('manual')}>
            <Play className="h-4 w-4" /> {t('regression.runNow')}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-gray-400">{t('regression.hint')}</p>

      {questions.isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}

      {!questions.isLoading && items.length === 0 && (
        <p className="mb-3 text-sm text-gray-400">{t('regression.empty')}</p>
      )}

      <div className="space-y-1.5">
        {items.map((q) => (
          <div key={q.id} className="flex items-center gap-2">
            <span className="flex-1 truncate rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">
              {q.question}
            </span>
            <Badge tone="gray">{q.language}</Badge>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate(q.id)}
              className="rounded p-1 text-gray-400 hover:text-error disabled:opacity-50"
              aria-label={t('regression.remove')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Input
          value={draft}
          disabled={busy || items.length >= max}
          placeholder={t('regression.addPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && draft.trim()) add.mutate();
          }}
        />
        <Button size="sm" disabled={busy || !draft.trim() || items.length >= max} onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" />
        </Button>
        <span className="whitespace-nowrap text-xs text-gray-400">
          {items.length} / {max}
        </span>
      </div>

      {runList.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-gray-500">{t('regression.recentRuns')}</p>
          <div className="space-y-1">
            {runList.map((r, idx) => {
              const prev = previousOf(idx);
              return (
                <div key={r.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <Badge tone={r.kind === 'after' ? 'success' : r.kind === 'noise' ? 'warning' : 'gray'}>
                    {t(`regression.kind_${r.kind}`)}
                  </Badge>
                  <span className="text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
                  <span>{t('regression.itemCount', { count: r.questionCount })}</span>
                  {r.truncated && <Badge tone="warning">{t('regression.truncated')}</Badge>}
                  {prev && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => compare.mutate({ base: prev.id, target: r.id })}
                      className="ml-auto text-primary-600 hover:underline disabled:opacity-50"
                    >
                      {t('regression.compareWithPrevious')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ComparisonModal comparison={comparison} onClose={() => setComparison(null)} />
    </Card>
  );
}
