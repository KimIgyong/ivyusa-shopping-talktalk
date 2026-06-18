import { useState } from 'react';
import { ArrowLeft, MessageSquare, Truck, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrder, useTracking } from '../../hooks/useOrders';
import { Badge, toneForStatus } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { formatMoney } from '../../lib/format';
import { TrackingStepper } from './TrackingStepper';
import { ReviewForm } from './ReviewForm';

export function OrderDetailView({
  orderId,
  sessionToken,
  onBack,
  onAsk,
}: {
  orderId: string;
  sessionToken: string | null;
  onBack: () => void;
  onAsk: (orderNumber: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useOrder(orderId, sessionToken);
  const [showTrack, setShowTrack] = useState(false);
  const [reviewItemId, setReviewItemId] = useState<string | null>(null);
  const tracking = useTracking(showTrack ? orderId : null, sessionToken);

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data)
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        {t('common.error')}
      </p>
    );

  const { order, items } = data;
  const delivered = /deliver|complete/i.test(order.statusUi);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('orders.back')}
      </button>

      <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            #{order.orderNumber}
          </span>
          <Badge tone={toneForStatus(order.statusUi)}>{order.statusUi}</Badge>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">{t('orders.total')}</span>
          <span className="font-semibold text-gray-900">
            {formatMoney(order.total, order.currency)}
          </span>
        </div>
      </div>

      <div className="mb-2 text-xs font-medium text-gray-400">
        {t('orders.items')}
      </div>
      <div className="mb-3 space-y-2">
        {items.map((it, i) => (
          <div
            key={it.id ?? i}
            className="rounded-lg border border-gray-200 bg-white p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800">
                  {it.title}
                </div>
                {it.optionText && (
                  <div className="text-xs text-gray-500">{it.optionText}</div>
                )}
                <div className="text-xs text-gray-400">x{it.qty}</div>
              </div>
              <span className="flex-shrink-0 text-sm text-gray-700">
                {formatMoney(it.price, order.currency)}
              </span>
            </div>
            {delivered && it.id && (
              <button
                onClick={() => setReviewItemId(it.id!)}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
              >
                <Star className="h-3.5 w-3.5" />
                {t('orders.writeReview')}
              </button>
            )}
          </div>
        ))}
      </div>

      {reviewItemId && (
        <div className="mb-3">
          <ReviewForm
            sessionToken={sessionToken}
            orderItemId={reviewItemId}
            onClose={() => setReviewItemId(null)}
          />
        </div>
      )}

      {showTrack && tracking.data && (
        <div className="mb-3">
          <TrackingStepper tracking={tracking.data} />
        </div>
      )}
      {showTrack && tracking.isLoading && <Spinner />}

      <div className="flex gap-2">
        <button
          onClick={() => setShowTrack((v) => !v)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Truck className="h-4 w-4" />
          {t('orders.track')}
        </button>
        <button
          onClick={() => onAsk(order.orderNumber)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          <MessageSquare className="h-4 w-4" />
          {t('orders.ask')}
        </button>
      </div>
    </div>
  );
}
