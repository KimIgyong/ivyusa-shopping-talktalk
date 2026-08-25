import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { useJourneyReport } from './journey.hooks';

/**
 * The report, with the conditions it was written under at the top.
 *
 * Those conditions are not decoration: reopened weeks later, a report is only
 * readable if it says what period, which sessions and which criteria version
 * produced it.
 */
export function JourneyReportModal({
  reportId,
  onClose,
}: {
  reportId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('journey');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useJourneyReport(reportId);

  return (
    <Modal
      open={!!reportId}
      onClose={onClose}
      size="lg"
      title={t('title')}
      footer={<Button variant="secondary" onClick={onClose}>{tc('close')}</Button>}
    >
      {isLoading || !data ? (
        <p className="text-sm text-gray-500">{tc('loading')}</p>
      ) : (
        <>
          <div className="mb-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            {t('conditions', {
              period: data.periodFrom ? `${data.periodFrom} ~ ${data.periodTo ?? ''}` : t('period.whole'),
              sessions: data.sessionCount,
              version: data.criteriaVersion,
              model: data.model ?? '—',
            })}
          </div>
          {data.status === 'failed' ? (
            <p className="text-sm text-red-600">{data.error}</p>
          ) : (
            <article className="prose prose-sm max-w-none whitespace-pre-wrap">
              {data.bodyMd}
            </article>
          )}
        </>
      )}
    </Modal>
  );
}
