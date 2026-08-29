import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Field';
import { useSimulateBoardDocument, useSimulateGolden } from './board.hooks';

/**
 * Pre-adoption simulation (PLN-260829 B2 P4-4/P4-5): what would the agent
 * answer if this board document WERE knowledge — plus the golden A/B numbers
 * the reviewer weighs before adopting. The verdict stays human.
 */
export function SimulationModal({
  open,
  onClose,
  documentId,
  documentTitle,
  onPromote,
  canPromote,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  onPromote: () => void;
  canPromote: boolean;
}) {
  const { t } = useTranslation('board');
  const { t: tc } = useTranslation('common');
  const [question, setQuestion] = useState('');
  const simulate = useSimulateBoardDocument();
  const golden = useSimulateGolden();
  const sim = simulate.data;
  const ab = golden.data;

  const pct = (v: number | null | undefined) =>
    v == null ? '—' : `${Math.round(v * 100)}%`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('simulation')} — ${documentTitle}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc('close')}
          </Button>
          {canPromote && (
            <Button disabled={!sim && !ab} onClick={onPromote}>
              {t('promoteThis')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim())
              simulate.mutate({ id: documentId, question: question.trim() });
          }}
        >
          <Input
            value={question}
            placeholder={t('simulationPlaceholder')}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={!question.trim() || simulate.isPending}>
            {simulate.isPending ? tc('loading') : t('run')}
          </Button>
        </form>

        {sim && (
          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            {sim.blocked ? (
              <p className="text-xs text-red-600">{t('simulationBlocked')}</p>
            ) : (
              <p className="whitespace-pre-wrap">{sim.answer}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={sim.candidateCited ? 'success' : 'warning'}>
                {sim.candidateCited ? t('candidateCited') : t('candidateNotCited')}
              </Badge>
              <span className="text-gray-600">
                {t('confidence')} <b className="tabular-nums">{pct(sim.confidence)}</b>
              </span>
              <span className="text-gray-600">
                {t('candidateSimilarity')}{' '}
                <b className="tabular-nums">{pct(sim.candidateSimilarity)}</b>
              </span>
            </div>
            <ul className="space-y-0.5 text-xs text-gray-600">
              {sim.sources.map((s, i) => (
                <li key={i} className="flex items-center gap-1">
                  {s.candidate && <Badge tone="info">{t('candidateBadge')}</Badge>}
                  <span className="truncate">{s.title}</span>
                  <span className="tabular-nums text-gray-400">{pct(s.similarity)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">{t('goldenAb')}</h4>
            <span className="text-xs text-gray-500">{t('goldenAbHint')}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={golden.isPending}
              onClick={() => {
                // Explicit cost notice — the A/B is 2 LLM calls per question.
                if (ab && !window.confirm(t('goldenRerunConfirm'))) return;
                golden.mutate(documentId);
              }}
            >
              {golden.isPending ? tc('loading') : t('goldenRun')}
            </Button>
          </div>
          {ab && (
            <>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 font-medium">{t('goldenQuestion')}</th>
                    <th className="py-1 font-medium">{t('goldenBaseWith')}</th>
                    <th className="py-1 font-medium">Δ</th>
                    <th className="py-1 font-medium">{t('candidateBadge')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ab.items.map((i, k) => (
                    <tr key={k} className="border-t border-gray-100">
                      <td className="max-w-[220px] truncate py-1">{i.question}</td>
                      <td className="py-1 tabular-nums">
                        {i.failed ? '—' : `${pct(i.baseConfidence)} → ${pct(i.withConfidence)}`}
                      </td>
                      <td
                        className={`py-1 tabular-nums ${
                          (i.delta ?? 0) > 0 ? 'text-green-600' : (i.delta ?? 0) < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {i.failed ? t('goldenFailed') : `${(i.delta ?? 0) > 0 ? '+' : ''}${i.delta}`}
                      </td>
                      <td className="py-1">{i.candidateCited ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-600">
                {t('goldenSummary', {
                  cited: ab.summary.cited,
                  total: ab.summary.questions,
                  delta: `${ab.summary.avgDelta > 0 ? '+' : ''}${ab.summary.avgDelta}`,
                })}
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
