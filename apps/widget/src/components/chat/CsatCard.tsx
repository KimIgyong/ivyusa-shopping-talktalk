import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Satisfaction prompt shown once a conversation ends (PLN-260810 P3).
 *
 * Dismissal is a first-class outcome, not a failure: `[close]` removes the card
 * and remembers that decision per conversation, so a shopper who does not want
 * to rate is not asked again every time they reopen the widget.
 */
export function CsatCard({
  conversationId,
  onRate,
}: {
  conversationId: string;
  onRate: (rating: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const storageKey = `ivy.csat.dismissed.${conversationId}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      // Private mode / blocked storage: showing the card is the safe default.
      return false;
    }
  });
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [hovered, setHovered] = useState(0);
  const [busy, setBusy] = useState(false);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* not being able to remember is better than not being able to dismiss */
    }
    setDismissed(true);
  };

  const submit = async (rating: number) => {
    if (busy || submitted != null) return;
    setBusy(true);
    try {
      await onRate(rating);
      setSubmitted(rating);
    } finally {
      setBusy(false);
    }
  };

  const filled = submitted ?? hovered;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center shadow-sm">
      <p className="mb-1.5 text-[13px] text-gray-700">
        {submitted != null ? t('chat.csatThanks') : t('chat.csatQuestion')}
      </p>
      <div
        className="flex justify-center gap-1"
        role="radiogroup"
        aria-label={t('chat.csatQuestion')}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={submitted === star}
            aria-label={t('chat.csatStar', { count: star })}
            disabled={busy || submitted != null}
            onMouseEnter={() => submitted == null && setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => void submit(star)}
            className={`text-2xl leading-none transition-colors ${
              star <= filled ? 'text-amber-400' : 'text-gray-300'
            } ${submitted == null ? 'hover:text-amber-400' : 'cursor-default'}`}
          >
            {star <= filled ? '★' : '☆'}
          </button>
        ))}
      </div>
      {submitted == null && (
        <button
          type="button"
          onClick={dismiss}
          className="mt-1 text-[11px] text-gray-400 underline-offset-2 hover:underline"
        >
          {t('chat.csatDismiss')}
        </button>
      )}
    </div>
  );
}
