import { useId } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ConsentBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="rounded-lg border border-gray-200 bg-gray-50 p-3"
    >
      <div
        id={titleId}
        className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800"
      >
        <ShieldCheck className="h-4 w-4 text-primary-500" />
        {t('chat.consent.title')}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-gray-600">
        {t('chat.consent.body')}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {t('chat.consent.accept')}
        </button>
        <button
          onClick={onDecline}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {t('chat.consent.decline')}
        </button>
      </div>
    </div>
  );
}
