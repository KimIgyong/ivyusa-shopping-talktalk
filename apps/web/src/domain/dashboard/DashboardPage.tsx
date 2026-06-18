import {
  MessagesSquare,
  Bell,
  Bot,
  AlertTriangle,
  MessageCircle,
  ShoppingCart,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('dashboard');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useDashboard();
  const { data: integrations, isLoading: intLoading } = useIntegrationStatus();

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label={t('activeChats')} value={data?.activeChats ?? (isLoading ? '…' : 0)} icon={MessagesSquare} />
        <KpiCard
          label={t('todayNotifications')}
          value={data?.todayNotifications ?? (isLoading ? '…' : 0)}
          icon={Bell}
        />
        <KpiCard
          label={t('aiResolutionRate')}
          value={isLoading ? '…' : pct(data?.aiResolutionRate)}
          icon={Bot}
        />
        <KpiCard
          label={t('unresolvedTopN')}
          value={data?.unresolvedTopN ?? (isLoading ? '…' : 0)}
          icon={AlertTriangle}
        />
        <KpiCard
          label={t('totalConversations')}
          value={data?.totalConversations ?? (isLoading ? '…' : 0)}
          icon={MessageCircle}
        />
        <KpiCard label={t('totalOrders')} value={data?.totalOrders ?? (isLoading ? '…' : 0)} icon={ShoppingCart} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title={t('popularQuestions')} className="lg:col-span-2">
          {isLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
          {!isLoading && (!data?.popularQuestions || data.popularQuestions.length === 0) && (
            <p className="text-sm text-gray-400">{tc('noData')}</p>
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

        <Card title={t('integrationStatus')}>
          {intLoading && <p className="text-sm text-gray-400">{tc('loading')}</p>}
          {!intLoading && (!integrations || integrations.length === 0) && (
            <p className="text-sm text-gray-400">{t('noIntegrations')}</p>
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
