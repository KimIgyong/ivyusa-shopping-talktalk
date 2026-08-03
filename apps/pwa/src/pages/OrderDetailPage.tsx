import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getOrder, getTracking } from '../services/orderService';
import { useSession } from '../store/session-context';
import { ApiError } from '../lib/api-client';

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
            <div key={item.id ?? String(idx)} className="item-row">
              <span className="item-title">
                {item.title}
                {item.optionText ? ` (${item.optionText})` : ''}
              </span>
              <span className="meta">
                ×{item.qty} · {item.price}
              </span>
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
