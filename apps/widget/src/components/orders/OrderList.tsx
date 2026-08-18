import { useQueries } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  TAB_ORDER_DAYS,
  TAB_ORDER_LIMIT,
  getTracking,
} from '../../services/orderService';
import { useOrders } from '../../hooks/useOrders';
import { myPageOrdersUrl } from '../../lib/platform';
import { formatMoney } from '../../lib/format';
import { Badge, toneForStatus } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { TrackingStepperH } from './TrackingStepperH';
import { isInTransit, statusLabel } from './order-status';
import type { OrderSummary, Tracking } from '../../lib/types';

/**
 * How many rows fetch their tracking. Tracking is one request per order, so this
 * is the same bound the Shipping filter applies — the difference is that here the
 * untracked rows still RENDER, they just render without a progress bar.
 */
const TRACKED_MAX = 5;

/** See ShipmentList: this key is an array, and a bad bundle must not throw. */
function trackingStepLabels(t: TFunction): string[] {
  const raw = t('orders.trackingSteps', { returnObjects: true });
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

function OrderRow({
  order,
  tracking,
  onOpen,
}: {
  order: OrderSummary;
  tracking: Tracking | undefined;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const label = statusLabel(t, order);
  const summary = order.firstItemTitle
    ? order.itemCount > 1
      ? t('orders.itemsMore', { title: order.firstItemTitle, count: order.itemCount - 1 })
      : order.firstItemTitle
    : t('orders.itemCount', { count: order.itemCount });

  const placed = order.orderedAt ?? order.createdAt;
  const placedText = placed
    ? new Date(placed).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      // A row is the whole target, not a chevron the thumb has to find.
      className="flex w-full flex-col border-b border-gray-100 px-4 py-4 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="text-base font-bold text-gray-900">{order.orderNumber}</span>
        {label && <Badge tone={toneForStatus(order.statusInternal ?? order.statusUi)}>{label}</Badge>}
      </div>

      <p className="mt-1 text-sm text-gray-700">{summary}</p>

      <div className="mt-1 flex w-full items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {[placedText, formatMoney(order.total, order.currency)].filter(Boolean).join(' · ')}
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" aria-hidden="true" />
      </div>

      {/* Progress belongs on the rows that are actually moving. Putting it on
          every row would make "delivered" and "in transit" look alike. */}
      {tracking && (
        <div className="mt-3 w-full">
          <TrackingStepperH tracking={tracking} labels={trackingStepLabels(t)} />
        </div>
      )}
    </button>
  );
}

/**
 * The Orders tab's list — every order, whatever its status.
 *
 * This exists because the tab named for orders did not show any (REQ-260818).
 * The list lived behind the Shipping chip, which additionally dropped anything
 * not yet shipped, so a paid-but-unshipped order appeared nowhere in the widget.
 * Status is shown, never used to hide a row.
 */
export function OrderList({
  sessionToken,
  onOpenOrder,
}: {
  sessionToken: string | null;
  onOpenOrder: (orderId: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useOrders(sessionToken, true, {
    size: TAB_ORDER_LIMIT,
    days: TAB_ORDER_DAYS,
  });
  const orders = data ?? [];

  // Filter FIRST, then bound. Bounding the raw list and filtering afterwards
  // spends the budget on rows that were never going to draw a bar, so a sixth
  // order that is genuinely moving would silently lose its progress.
  const tracked = orders.filter(isInTransit).slice(0, TRACKED_MAX);
  const trackingQueries = useQueries({
    queries: tracked.map((o) => ({
      queryKey: ['tracking', o.id, sessionToken],
      queryFn: () => getTracking(o.id, sessionToken!),
      staleTime: 60_000,
    })),
  });
  // Index-into-`orders` no longer lines up with the query array — match by id.
  const trackingById = new Map(
    tracked.map((o, i) => [o.id, trackingQueries[i]?.data as Tracking | undefined]),
  );

  const myPageUrl = myPageOrdersUrl();

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError) return <p className="py-8 text-center text-sm text-gray-400">{t('common.error')}</p>;

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-gray-400">
        <Package className="h-6 w-6" />
        <span className="text-sm">{t('orders.emptyRecent', { days: TAB_ORDER_DAYS })}</span>
        {myPageUrl && (
          <a
            href={myPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-xs font-medium text-primary-600 underline"
          >
            {t('orders.viewAllOnMall')}
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      {orders.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          tracking={trackingById.get(order.id)}
          onOpen={() => onOpenOrder(order.id)}
        />
      ))}

      {/* Only when the window is actually full — otherwise this reads as "there
          is more" to a shopper who is looking at everything they have. */}
      {orders.length >= TAB_ORDER_LIMIT && myPageUrl && (
        <a
          href={myPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 py-4 text-center text-sm font-medium text-primary-600 underline"
        >
          {t('orders.viewAllOnMall')}
        </a>
      )}
    </div>
  );
}
