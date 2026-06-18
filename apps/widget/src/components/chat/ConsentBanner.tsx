import { ShieldCheck } from 'lucide-react';
import { strings } from '../../i18n/strings';

export function ConsentBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <ShieldCheck className="h-4 w-4 text-primary-500" />
        {strings.chat.consent.title}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-gray-600">
        {strings.chat.consent.body}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
        >
          {strings.chat.consent.accept}
        </button>
        <button
          onClick={onDecline}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {strings.chat.consent.decline}
        </button>
      </div>
    </div>
  );
}
