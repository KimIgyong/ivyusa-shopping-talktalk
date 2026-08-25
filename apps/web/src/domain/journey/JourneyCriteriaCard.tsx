import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { FormRow, Input } from '@/components/Field';
import { useJourneyCriteria, useSaveJourneyCriteria } from './journey.hooks';

/** The report's sections, in the order they are written. */
const SECTIONS = ['summary', 'contact', 'questions', 'resolution', 'path', 'needs', 'actions'];

/**
 * The rules journey reports are written by (PLN-260825 D2).
 *
 * Editable because what is worth asking differs by trade and improves with
 * use — that is the point of keeping them out of the code. Versioned because a
 * past report pins the version it used: changing the rules must not rewrite
 * what an earlier report was judged by, or the decision someone made from it
 * cannot be retraced.
 */
export function JourneyCriteriaCard() {
  const { t } = useTranslation('journey');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useJourneyCriteria();
  const save = useSaveJourneyCriteria();

  const [sections, setSections] = useState<Record<string, string>>({});
  const [topN, setTopN] = useState(5);
  const [sampleCap, setSampleCap] = useState(200);
  const [quoteMax, setQuoteMax] = useState(200);
  const [banned, setBanned] = useState('');

  useEffect(() => {
    if (!data?.current) return;
    setSections(data.current.sections ?? {});
    setTopN(data.current.topQuestionsN);
    setSampleCap(data.current.sampleCap);
    setQuoteMax(data.current.quoteMaxChars);
    setBanned((data.current.banned ?? []).join('\n'));
  }, [data?.current]);

  if (isLoading || !data) {
    return (
      <Card title={t('criteria.title')}>
        <p className="text-sm text-gray-500">{tc('loading')}</p>
      </Card>
    );
  }

  return (
    <Card
      title={t('criteria.title')}
      action={<Badge tone="primary">v{data.current.version}</Badge>}
    >
      <p className="mb-3 text-xs text-gray-500">{t('criteria.hint')}</p>

      <div className="space-y-3">
        {SECTIONS.map((key) => (
          <FormRow key={key} label={t(`criteria.section.${key}`)}>
            <textarea
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              rows={2}
              value={sections[key] ?? ''}
              onChange={(e) => setSections((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </FormRow>
        ))}

        <div className="grid gap-3 sm:grid-cols-3">
          <FormRow label={t('criteria.topN')}>
            <Input
              type="number"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
            />
          </FormRow>
          <FormRow label={t('criteria.sampleCap')}>
            <Input
              type="number"
              value={sampleCap}
              onChange={(e) => setSampleCap(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-gray-500">{t('criteria.sampleCapHint')}</p>
          </FormRow>
          <FormRow label={t('criteria.quoteMax')}>
            <Input
              type="number"
              value={quoteMax}
              onChange={(e) => setQuoteMax(Number(e.target.value))}
            />
          </FormRow>
        </div>

        <FormRow label={t('criteria.banned')}>
          <textarea
            className="w-full rounded-lg border border-gray-300 p-2 font-mono text-sm"
            rows={3}
            value={banned}
            onChange={(e) => setBanned(e.target.value)}
          />
          {/* Seeded with the pseudo-quantitative ones: a score nobody can
              derive is the most convincing thing a report can get wrong. */}
          <p className="mt-1 text-xs text-gray-500">{t('criteria.bannedHint')}</p>
        </FormRow>

        <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            {t('criteria.newVersionNote', { next: data.current.version + 1 })}
          </p>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                sections,
                top_questions_n: topN,
                sample_cap: sampleCap,
                quote_max_chars: quoteMax,
                banned: banned
                  .split('\n')
                  .map((b) => b.trim())
                  .filter(Boolean),
              })
            }
          >
            {save.isPending ? tc('saving') : tc('save')}
          </Button>
        </div>

        {data.history.length > 1 ? (
          <p className="text-xs text-gray-500">
            {t('criteria.history', { count: data.history.length })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
