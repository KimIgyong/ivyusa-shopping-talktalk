import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getOrder, getTracking } from '../services/orderService';
import { submitReview } from '../services/reviewService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api-client';

/** Per-item review form (F2, A-8) — 5 stars + optional text, widget ReviewForm parity. */
function ItemReview({ orderItemId }: { orderItemId: string }) {
  const { t } = useTranslation();
  const { token } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return <p className="meta review-done">⭐ {t('review.submitted')}</p>;

  const submit = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      await submitReview(token, orderItemId, rating, body.trim() || undefined);
      toast.show(t('review.submitted'));
      setDone(true);
    } catch (e) {
      // D1 ownership guard → 403; D2 moderation gate → 422.
      if (e instanceof ApiError && e.status === 403) toast.show(t('review.notOwner'), 'error');
      else if (e instanceof ApiError && e.status === 422) toast.show(t('review.blocked'), 'error');
      else toast.show(t('review.failed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm review-toggle" onClick={() => setOpen(true)}>
        ✏️ {t('review.write')}
      </button>
    );
  }

  return (
    <div className="review-form">
      <div className="star-row" role="radiogroup" aria-label={t('review.write')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t('review.starLabel', { n })}
            className={`star-btn ${n <= rating ? 'star-on' : ''}`}
            onClick={() => setRating(n)}
          >
            {n <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        className="input review-textarea"
        value={body}
        placeholder={t('review.placeholder')}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="review-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={submitting}
        >
          {t('review.submit')}
        </button>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { token } = useSession();

  const orderQuery = useQuery({
    queryKey: ['order', id, token],
    enabled: !!token && !!id,
    queryFn: () => getOrder(id!, token!),
  });

  const trackingQuery = useQuery({
    queryKey: ['tracking', id, token],
    enabled: !!token && !!id,
    queryFn: async () => {
      try {
        return await getTracking(id!, token!);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

  const detail = orderQuery.data;
  const tracking = trackingQuery.data;

  return (
    <div className="page">
      <Link className="back-link" to="/orders">
        ← {t('common.back')}
      </Link>

      {orderQuery.isLoading ? <p className="hint">{t('common.loading')}</p> : null}

      {detail && (
        <div className="card">
          <div className="detail-head">
            <span className="order-no order-no-lg">#{detail.order.orderNumber}</span>
            <span className="badge">{detail.order.statusUi}</span>
          </div>
          <div className="meta">
            {detail.order.currency} {detail.order.total}
          </div>
          <h3 className="section-title">{t('orders.items')}</h3>
          {detail.items.map((item, idx) => (
            <div key={item.id ?? String(idx)} className="item-block">
              <div className="item-row">
                <span className="item-title">
                  {item.title}
                  {item.optionText ? ` (${item.optionText})` : ''}
                </span>
                <span className="meta">
                  ×{item.qty} · {item.price}
                </span>
              </div>
              {item.id ? <ItemReview orderItemId={item.id} /> : null}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="section-title">{t('orders.tracking')}</h3>
        {tracking ? (
          <>
            <div className="meta">
              {t('orders.carrier')}: {tracking.carrier || '—'} · {t('orders.trackingNumber')}:{' '}
              {tracking.trackingNumber || '—'}
            </div>
            <div className="steps">
              {tracking.steps.map((step, idx) => {
                const done = idx <= tracking.stepIndex;
                return (
                  <div key={step.label} className="step-row">
                    <span className={`dot ${done ? 'dot-done' : ''}`} />
                    <span className={`step-label ${done ? 'step-label-done' : ''}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="meta">
            {trackingQuery.isLoading ? t('common.loading') : t('orders.noTracking')}
          </p>
        )}
      </div>
    </div>
  );
}
