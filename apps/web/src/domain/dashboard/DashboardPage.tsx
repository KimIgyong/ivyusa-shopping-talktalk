import {
  MessagesSquare,
  Bell,
  Bot,
  AlertTriangle,
  MessageCircle,
  ShoppingCart,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { KpiCard } from '@/components/KpiCard';
import { Card } from '@/components/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { useDashboard, useIntegrationStatus } from './dashboard.hooks';

function pct(value: number | undefined) {
  if (value == null) return '–';
  const n = value <= 1 ? value * 100 : value;
  return `${Math.round(n)}%`;
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const { data: integrations, isLoading: intLoading } = useIntegrationStatus();

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Realtime overview of your support operations" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Active chats" value={data?.activeChats ?? (isLoading ? '…' : 0)} icon={MessagesSquare} />
        <KpiCard
          label="Today's notifications"
          value={data?.todayNotifications ?? (isLoading ? '…' : 0)}
          icon={Bell}
        />
        <KpiCard
          label="AI resolution rate"
          value={isLoading ? '…' : pct(data?.aiResolutionRate)}
          icon={Bot}
        />
        <KpiCard
          label="Unresolved (top N)"
          value={data?.unresolvedTopN ?? (isLoading ? '…' : 0)}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Total conversations"
          value={data?.totalConversations ?? (isLoading ? '…' : 0)}
          icon={MessageCircle}
        />
        <KpiCard label="Total orders" value={data?.totalOrders ?? (isLoading ? '…' : 0)} icon={ShoppingCart} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Popular questions" className="lg:col-span-2">
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!isLoading && (!data?.popularQuestions || data.popularQuestions.length === 0) && (
            <p className="text-sm text-gray-400">No data yet.</p>
          )}
          <ul className="divide-y divide-gray-100">
            {data?.popularQuestions?.map((q, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-3 text-gray-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                    {i + 1}
                  </span>
                  {q.question}
                </span>
                <span className="text-gray-400">{q.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Integration status">
          {intLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!intLoading && (!integrations || integrations.length === 0) && (
            <p className="text-sm text-gray-400">No integrations configured.</p>
          )}
          <ul className="space-y-3">
            {integrations?.map((it) => (
              <li key={it.provider} className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{it.provider}</span>
                <StatusBadge status={it.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
