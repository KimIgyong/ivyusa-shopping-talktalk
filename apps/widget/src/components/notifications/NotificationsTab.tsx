import { useEffect, useState } from 'react';
import { BellOff, ExternalLink, Lock, Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { AuthGate } from '../chat/AuthGate';
import { isAuthError } from '../../lib/errors';
import { useMarkRead, useNotifications } from '../../hooks/useNotifications';
import { listIssues, type IssueFeedItem } from '../../services/orderService';
import { myPageOrdersUrl } from '../../lib/platform';
import { Badge, toneForStatus } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { formatDate, groupByDate, relativeTime } from '../../lib/format';
import { NotificationIcon } from './NotificationIcon';
import { ShipmentList } from './ShipmentList';
import { OrderDetailView } from '../orders/OrderDetail';
import { ReviewForm } from '../orders/ReviewForm';
import type { NotificationItem } from '../../lib/types';

/**
 * Filter chips (PLN-260817 W-1).
 *
 * The design shows five. `inquiries` is a sixth, added as an approved deviation
 * (PLN §7 D-3): the two-tab IA retires the Orders tab, and this is the only
 * surface the shipped issue feed (`listIssues`, PLN-260810 P3) can live on.
 */
const FILTERS: { key: string; labelKey: string }[] = [
  { key: 'all', labelKey: 'notifications.filters.all' },
  { key: 'payment', labelKey: 'notifications.filters.payment' },
  { key: 'shipping', labelKey: 'notifications.filters.shipping' },
  { key: 'event', labelKey: 'notifications.filters.event' },
  { key: 'review', labelKey: 'notifications.filters.review' },
  { key: 'inquiries', labelKey: 'notifications.filters.inquiries' },
];

function Row({
  n,
  highlighted,
  onRead,
  onReview,
}: {
  n: NotificationItem;
  highlighted: boolean;
  onRead: (id: string) => void;
  onReview: (orderItemId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const unread = !n.readAt;
  // A review request can only open the form when the notification carries the
  // item it refers to. Rows written before `refType`/`refId` existed have none,
  // so they render as plain rows rather than a button that cannot work.
  const reviewable = n.category === 'review' && n.refType === 'order_item' && !!n.refId;

  return (
    <div
      className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3.5 text-left ${
        highlighted ? 'bg-highlight' : 'bg-white'
      }`}
    >
      <NotificationIcon category={n.category} hasLink={!!n.linkUrl} highlighted={highlighted} />
      <button
        onClick={() => unread && onRead(n.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          {n.title && (
            <span className="truncate text-sm font-bold text-gray-900">{n.title}</span>
          )}
          {n.statusBadge && (
            <Badge tone={toneForStatus(n.statusBadge)}>{n.statusBadge}</Badge>
          )}
        </div>
        {n.body && <p className="mt-0.5 text-sm text-gray-800">{n.body}</p>}
        {reviewable && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onReview(n.refId!);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onReview(n.refId!);
              }
            }}
            className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
          >
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            {t('orders.writeReview')}
          </span>
        )}
        <p className="mt-1 text-xs text-gray-400">{relativeTime(n.createdAt, i18n.language)}</p>
      </button>
      {unread && (
        <span className="mt-1.5 flex-shrink-0" aria-label={t('notifications.unread')}>
          <span className="block h-2 w-2 rounded-full bg-error" />
        </span>
      )}
    </div>
  );
}

function IssueFeed({ issues }: { issues: IssueFeedItem[] }) {
  const { t, i18n } = useTranslation();
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
        <BellOff className="h-6 w-6" />
        <span className="text-sm">{t('orders.noInquiries')}</span>
      </div>
    );
  }
  return (
    <div>
      {issues.map((i) => (
        <div key={i.issueNo} className="border-b border-gray-100 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">
              #{i.issueNo} · {t(`orders.issues.type.${i.type}`, { defaultValue: i.type })}
            </span>
            <Badge tone={toneForStatus(i.status)}>
              {t(`orders.issues.status.${i.status}`, { defaultValue: i.status })}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-800">
            {t(`orders.issues.line.${i.status}`, { defaultValue: '' })}
          </p>
          {i.updatedAt && (
            <p className="mt-1 text-xs text-gray-400">{formatDate(i.updatedAt, i18n.language)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function NotificationsTab() {
  const { t, i18n } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const queueChatMessage = useWidgetStore((s) => s.queueChatMessage);
  const notifFilter = useWidgetStore((s) => s.notificationFilter);
  const setNotifFilter = useWidgetStore((s) => s.setNotificationFilter);

  // Sub-views pushed over the list. Both used to be reachable only through the
  // Orders tab, which the two-tab IA removed (PLN-260817 S3).
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const isShipping = notifFilter === 'shipping';
  const isInquiries = notifFilter === 'inquiries';
  const { data, isLoading, isError, error } = useNotifications(
    sessionToken,
    isShipping || isInquiries ? 'all' : notifFilter,
  );
  const markRead = useMarkRead(sessionToken);

  const { data: issueFeed } = useQuery({
    queryKey: ['issues', sessionToken],
    queryFn: () => listIssues(sessionToken!),
    enabled: !!sessionToken && authenticated && isInquiries,
    refetchInterval: 15_000,
  });

  // Notifications are customer-scoped. Don't wait for a 401 to work that out: the
  // widget already knows whether the session is bound, and a query that never
  // settles (a retry react-query paused, a slow link) would otherwise leave the
  // shopper looking at "No notifications yet" — which reads as "you have none"
  // rather than "sign in first". `authLost` still covers the session going stale
  // mid-visit, where the server is the authority.
  const authLost = isError && isAuthError(error);
  useEffect(() => {
    if (authLost) setAuthenticated(false);
  }, [authLost, setAuthenticated]);

  if (!authenticated || authLost) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <Lock className="h-6 w-6 text-gray-300" />
        <AuthGate
          sessionToken={sessionToken}
          onSuccess={() => setAuthenticated(true)}
          onCancel={() => {}}
        />
      </div>
    );
  }

  if (openOrder) {
    return (
      <OrderDetailView
        orderId={openOrder}
        sessionToken={sessionToken}
        onBack={() => setOpenOrder(null)}
        onAsk={(orderNumber) => queueChatMessage(t('orders.askMessage', { orderNumber }))}
      />
    );
  }

  if (reviewItem) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <ReviewForm
          sessionToken={sessionToken}
          orderItemId={reviewItem}
          onClose={() => setReviewItem(null)}
        />
      </div>
    );
  }

  const groups = groupByDate(data ?? [], i18n.language);
  // Exactly one row wears the highlight wash: the newest unread (PLN §7 D-5).
  // The design shows a single emphasised row and no rule for it; making every
  // unread row cream would turn a 20-row list into a cream block.
  const newestUnreadId = (data ?? []).find((n) => !n.readAt)?.id ?? null;
  const myPageUrl = myPageOrdersUrl();

  return (
    <div className="flex h-full flex-col">
      {/* Filter chips */}
      <div className="scroll-thin flex gap-2 overflow-x-auto border-b border-gray-100 px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setNotifFilter(f.key)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              notifFilter === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {isShipping ? (
          <ShipmentList sessionToken={sessionToken} onOpenOrder={setOpenOrder} />
        ) : isInquiries ? (
          <IssueFeed issues={issueFeed ?? []} />
        ) : (
          <>
            {isLoading && <Spinner label={t('common.loading')} />}
            {isError && (
              <p className="py-8 text-center text-sm text-gray-400">{t('common.error')}</p>
            )}
            {!isLoading && !isError && groups.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <BellOff className="h-6 w-6" />
                <span className="text-sm">{t('notifications.empty')}</span>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
                  {g.relative ? t(`notifications.groups.${g.relative}`) : g.label}
                </div>
                {g.items.map((n) => (
                  <Row
                    key={n.id}
                    n={n}
                    highlighted={n.id === newestUnreadId}
                    onRead={(id) => markRead.mutate(id)}
                    onReview={setReviewItem}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* The widget shows a bounded recent window inline (10 orders / 30 days);
          the full, canonical history lives on the storefront's own my-page. */}
      <div className="border-t border-gray-100">
        {!moreOpen ? (
          <button
            onClick={() => setMoreOpen(true)}
            className="flex w-full items-center justify-center py-2.5 text-xs font-medium text-primary-600 transition-colors hover:bg-gray-50"
          >
            {t('orders.more')}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-3 py-2.5 text-center">
            <span className="text-xs text-gray-500">{t('orders.moreInMyPage')}</span>
            {myPageUrl && (
              <a
                href={myPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline"
              >
                {t('orders.viewAllOnMall')}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
