import { useEffect, useState } from 'react';
import { ChevronRight, PackageSearch, Lock, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWidgetStore } from '../../store/widgetStore';
import { useOrders } from '../../hooks/useOrders';
import { Badge, toneForStatus } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { formatDate, formatMoney } from '../../lib/format';
import { myPageOrdersUrl } from '../../lib/platform';
import { isAuthError } from '../../lib/errors';
import { OrderDetailView } from './OrderDetail';
import { AuthGate } from '../chat/AuthGate';
import type { OrderSummary } from '../../lib/types';

type SubTab = 'payments' | 'shipping' | 'inquiries';

const SUBTABS: { key: SubTab; labelKey: string }[] = [
  { key: 'payments', labelKey: 'orders.subtabs.payments' },
  { key: 'shipping', labelKey: 'orders.subtabs.shipping' },
  { key: 'inquiries', labelKey: 'orders.subtabs.inquiries' },
];

function filterForSubtab(orders: OrderSummary[], sub: SubTab): OrderSummary[] {
  // statusUi is nullable on the wire; `?? ''` keeps a status-less order out of the
  // filtered tabs instead of matching on the string "null".
  if (sub === 'shipping')
    return orders.filter((o) => /ship|transit|deliver/i.test(o.statusUi ?? ''));
  if (sub === 'inquiries')
    return orders.filter((o) => /cancel|refund|return|inquir/i.test(o.statusUi ?? ''));
  return orders; // payments == all paid orders
}

export function OrdersTab() {
  const { t } = useTranslation();
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const queueChatMessage = useWidgetStore((s) => s.queueChatMessage);

  const [sub, setSub] = useState<SubTab>('payments');
  const [selected, setSelected] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const { data, isLoading, isError, error } = useOrders(sessionToken, authenticated);

  // The server is the authority on whether this session is still customer-bound.
  // It can stop being bound while the widget thinks otherwise — after a DSAR data
  // deletion, for instance — and then every read 401s. Trust the server and drop
  // back to the sign-in prompt instead of showing "Something went wrong".
  const authLost = isError && isAuthError(error);
  useEffect(() => {
    if (authLost) setAuthenticated(false);
  }, [authLost, setAuthenticated]);

  // Just back from a redirect sign-in (loader auto-reopened this tab) while the
  // identity handshake is still in flight — hold a spinner rather than flashing
  // the sign-in prompt at a shopper who signed in two seconds ago.
  const embedIdentity = useWidgetStore((s) => s.embedIdentity);
  if (!authenticated && embedIdentity === 'pending' && window.parent !== window) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

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

  if (selected) {
    return (
      <OrderDetailView
        orderId={selected}
        sessionToken={sessionToken}
        onBack={() => setSelected(null)}
        onAsk={(orderNumber) =>
          queueChatMessage(t('orders.askMessage', { orderNumber }))
        }
      />
    );
  }

  const orders = filterForSubtab(data ?? [], sub);
  // The widget shows a bounded recent window inline (10 orders / 30 days); the
  // full, canonical history lives on the storefront's own my-page — "view more"
  // reveals a pointer there (the mall authenticates the member itself, so the
  // link works even when nothing synced yet).
  const myPageUrl = myPageOrdersUrl();

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-gray-100">
        {SUBTABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSub(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              sub === tab.key
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {isLoading && <Spinner label={t('common.loading')} />}
        {isError && (
          <p className="py-8 text-center text-sm text-gray-400">
            {t('common.error')}
          </p>
        )}
        {!isLoading && !isError && orders.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <PackageSearch className="h-6 w-6" />
            <span className="text-sm">{t('orders.emptyRecent')}</span>
          </div>
        )}
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() => setSelected(o.id)}
            className="mb-2 flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-primary-400"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  #{o.orderNumber}
                </span>
                <Badge tone={toneForStatus(o.statusUi)}>{o.statusUi}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span>{formatDate(o.orderedAt ?? o.createdAt)}</span>
                <span>·</span>
                <span>
                  {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                </span>
                <span>·</span>
                <span className="font-medium text-gray-700">
                  {formatMoney(o.total, o.currency)}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
          </button>
        ))}
      </div>

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
