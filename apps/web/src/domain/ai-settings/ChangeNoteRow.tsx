import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';

interface ChangeNoteRowProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
}

/**
 * The "why" that goes with a save, next to the save button (FR-073).
 *
 * A snapshot answers what the persona used to say; only this answers why anyone
 * changed it. Coached changes inherit the proposal's rationale automatically —
 * without this field a manual save would be the one path that lands in the
 * history as an anonymous overwrite.
 *
 * Optional on purpose: making it mandatory would tax every one-word typo fix,
 * and a required field people fill with "." is worse than an empty one.
 */
export function ChangeNoteRow({ value, onChange, onSave, saving, disabled }: ChangeNoteRowProps) {
  const { t } = useTranslation('aiSetting');
  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <div className="min-w-0 flex-1">
        <Input
          value={value}
          maxLength={500}
          disabled={saving || disabled}
          placeholder={t('history.notePlaceholder')}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !saving) onSave();
          }}
        />
      </div>
      <Button size="sm" disabled={saving || disabled} onClick={onSave}>
        {t('save')}
      </Button>
    </div>
  );
}
