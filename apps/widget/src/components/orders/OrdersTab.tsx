import { useState } from 'react';
import { ChevronRight, PackageSearch, Lock } from 'lucide-react';
import { strings } from '../../i18n/strings';
import { useWidgetStore } from '../../store/widgetStore';
import { useOrders } from '../../hooks/useOrders';
import { Badge, toneForStatus } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { formatDate, formatMoney } from '../../lib/format';
import { OrderDetailView } from './OrderDetail';
import { AuthGate } from '../chat/AuthGate';
import type { OrderSummary } from '../../lib/types';

type SubTab = 'payments' | 'shipping' | 'inquiries';

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'payments', label: strings.orders.subtabs.payments },
  { key: 'shipping', label: strings.orders.subtabs.shipping },
  { key: 'inquiries', label: strings.orders.subtabs.inquiries },
];

function filterForSubtab(orders: OrderSummary[], sub: SubTab): OrderSummary[] {
  if (sub === 'shipping')
    return orders.filter((o) => /ship|transit|deliver/i.test(o.statusUi));
  if (sub === 'inquiries')
    return orders.filter((o) => /cancel|refund|return|inquir/i.test(o.statusUi));
  return orders; // payments == all paid orders
}

export function OrdersTab() {
  const sessionToken = useWidgetStore((s) => s.sessionToken);
  const authenticated = useWidgetStore((s) => s.authenticated);
  const setAuthenticated = useWidgetStore((s) => s.setAuthenticated);
  const queueChatMessage = useWidgetStore((s) => s.queueChatMessage);

  const [sub, setSub] = useState<SubTab>('payments');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError } = useOrders(sessionToken, authenticated);

  if (!authenticated) {
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
          queueChatMessage(`I have a question about order #${orderNumber}.`)
        }
      />
    );
  }

  const orders = filterForSubtab(data ?? [], sub);

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-gray-100">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              sub === t.key
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {isLoading && <Spinner label={strings.common.loading} />}
        {isError && (
          <p className="py-8 text-center text-sm text-gray-400">
            {strings.common.error}
          </p>
        )}
        {!isLoading && !isError && orders.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <PackageSearch className="h-6 w-6" />
            <span className="text-sm">{strings.orders.empty}</span>
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
                <span>{formatDate(o.createdAt)}</span>
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
    </div>
  );
}
