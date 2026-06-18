import { useState } from 'react';
import { Star, CheckCircle2 } from 'lucide-react';
import { strings } from '../../i18n/strings';
import { createReview } from '../../services/miscService';

export function ReviewForm({
  sessionToken,
  orderItemId,
  onClose,
}: {
  sessionToken: string | null;
  orderItemId: string;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!sessionToken || rating === 0) return;
    setLoading(true);
    try {
      await createReview(sessionToken, orderItemId, rating, body);
      setDone(true);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 text-center">
        <CheckCircle2 className="h-6 w-6 text-success" />
        <p className="text-sm font-medium text-gray-800">
          {strings.review.thanks}
        </p>
        <button
          onClick={onClose}
          className="text-xs text-primary-600 hover:underline"
        >
          {strings.orders.back}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 text-sm font-semibold text-gray-800">
        {strings.review.title}
      </div>
      <div className="mb-1 text-xs text-gray-500">{strings.review.rating}</div>
      <div className="mb-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onMouseEnter={() => setHover(v)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(v)}
            aria-label={`${v} stars`}
          >
            <Star
              className={`h-6 w-6 ${
                v <= (hover || rating)
                  ? 'fill-warning text-warning'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={strings.review.placeholder}
        rows={3}
        className="mb-2 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          disabled={rating === 0 || loading}
          onClick={submit}
          className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {loading ? strings.common.loading : strings.review.submit}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {strings.orders.back}
        </button>
      </div>
    </div>
  );
}
