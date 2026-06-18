import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, Cpu, MessageSquare, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { dashboardService } from '@/domain/dashboard/dashboard.service';
import { useTenants } from './admin.hooks';

export function AdminOverviewPage() {
  const { t } = useTranslation('overview');
  const { t: tc } = useTranslation('common');
  const tenantsQuery = useTenants({ page: 1, pageSize: 20 });
  const integrationsQuery = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: () => dashboardService.integrations(),
  });

  const totalTenants =
    tenantsQuery.data?.total !== undefined ? String(tenantsQuery.data.total) : '—';

  const integrations = integrationsQuery.data ?? [];

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('totalTenants')} value={totalTenants} icon={Building2} />
        <KpiCard label={t('activeTenants')} value="—" icon={CheckCircle2} hint={t('comingSoon')} />
        <KpiCard label={t('aiEngines')} value="—" icon={Cpu} hint={t('comingSoon')} />
        <KpiCard label={t('conversations')} value="—" icon={MessageSquare} hint={t('comingSoon')} />
      </div>

      <Card title={t('integrationStatus')}>
        {integrationsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {tc('loading')}
          </div>
        ) : integrations.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t('noIntegrations')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {integrations.map((i) => (
              <li key={i.provider} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{i.provider}</p>
                  {i.detail && <p className="text-xs text-gray-400">{i.detail}</p>}
                </div>
                <StatusBadge status={i.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
