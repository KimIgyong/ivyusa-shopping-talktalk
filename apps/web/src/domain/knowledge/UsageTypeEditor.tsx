import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { usePreviewUsageType, useSaveUsageType } from './knowledge.hooks';
import type { UsageType } from './knowledge.service';

interface Props {
  open: boolean;
  /** Null when adding. */
  type: UsageType | null;
  onClose: () => void;
}

/**
 * Add or retune one usage-guide type (PLN-260824 A축, D2).
 *
 * The match count is the whole point of this dialog. A keyword that fits
 * nothing does not fail — it simply matches nothing, and "0 products" reads
 * exactly like "this catalogue has none of those". Showing the count while the
 * operator is still typing is the only cheap place to tell those apart.
 */
export function UsageTypeEditor({ open, type, onClose }: Props) {
  const { t } = useTranslation('knowledge');
  const { t: tc } = useTranslation('common');
  const save = useSaveUsageType();
  const preview = usePreviewUsageType();

  const [label, setLabel] = useState('');
  const [keywords, setKeywords] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLabel(type?.label ?? '');
    setKeywords((type?.keywords ?? []).join('\n'));
    setActive(type?.active ?? true);
  }, [open, type]);

  const lines = keywords
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean);

  // Debounced so a preview fires per pause, not per keystroke: each one reads
  // the tenant's catalogue.
  useEffect(() => {
    if (!open || !lines.length) return;
    const id = setTimeout(() => preview.mutate({ keywords: lines, excludeId: type?.id }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, keywords, type?.id]);

  const matched = lines.length ? preview.data?.matched : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={type ? t('usageTypeEdit') : t('usageTypeAdd')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            disabled={!label.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { id: type?.id, label: label.trim(), keywords: lines, active },
                { onSuccess: onClose },
              )
            }
          >
            {save.isPending ? tc('loading') : tc('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormRow label={t('usageTypeLabel')}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </FormRow>
        <FormRow label={t('usageTypeKeywords')}>
          <textarea
            className="w-full rounded-lg border border-gray-300 p-2 font-mono text-sm"
            rows={5}
            value={keywords}
            placeholder={t('usageTypeKeywordsPlaceholder')}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">{t('usageTypeKeywordsHint')}</p>
        </FormRow>

        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          {preview.isPending ? (
            <span className="text-gray-500">{tc('loading')}</span>
          ) : (
            <>
              <span className={matched ? 'font-semibold' : 'font-semibold text-amber-700'}>
                {t('usageTypeMatched', { count: matched ?? 0 })}
              </span>
              {preview.data?.samples?.length ? (
                <p className="mt-1 text-xs text-gray-600">
                  {preview.data.samples.join(', ')}
                </p>
              ) : null}
              {lines.length && matched === 0 ? (
                <p className="mt-1 text-xs text-amber-700">{t('usageTypeNoMatchHint')}</p>
              ) : null}
            </>
          )}
        </div>

        {type ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {/* Off, not deleted: a seeded type that does not fit this shop
                should stop matching without taking its guide body with it. */}
            <span>{t('usageTypeActive')}</span>
          </label>
        ) : null}

        {/* Ordering is not decoration: the first matching type claims a product,
            so a narrow type has to sit above the broad one containing it. */}
        <p className="text-xs text-gray-500">{t('usageTypeOrderHint')}</p>
      </div>
    </Modal>
  );
}
