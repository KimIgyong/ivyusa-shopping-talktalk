import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutList, UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { useTenants, useCreateTenant, useSetTenantStatus } from './admin.hooks';
import { TenantMenusModal } from './TenantMenusModal';
import type { Tenant } from './admin.service';

const PAGE_SIZE = 20;
const PLANS = ['starter', 'growth', 'enterprise'];

export function TenantsPage() {
  const { t } = useTranslation('tenants');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [plan, setPlan] = useState(PLANS[0]);
  // Tenant whose provided-menu modal is open (PLN-260812 S2).
  const [menusFor, setMenusFor] = useState<Tenant | null>(null);

  const { data, isLoading, error } = useTenants({ page, pageSize: PAGE_SIZE });
  const createTenant = useCreateTenant();
  const setStatus = useSetTenantStatus();

  const resetForm = () => {
    setName('');
    setSlug('');
    setShopDomain('');
    setPlan(PLANS[0]);
  };

  const handleCreate = () => {
    createTenant.mutate(
      { name, shopDomain, plan, slug: slug.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          resetForm();
        },
      },
    );
  };

  const columns: Column<Tenant>[] = [
    { key: 'name', header: t('name'), render: (r) => r.name },
    {
      key: 'slug',
      header: t('slug'),
      // The tenant login page path — what shop staff type after the host name.
      render: (r) => (r.slug ? <code className="text-xs text-gray-600">/{r.slug}</code> : '—'),
    },
    { key: 'shopDomain', header: t('shopDomain'), render: (r) => r.shopDomain ?? '—' },
    {
      key: 'plan',
      header: t('plan'),
      render: (r) => (r.plan ? <Badge tone="primary">{r.plan}</Badge> : '—'),
    },
    { key: 'status', header: t('status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'userCount', header: t('users'), render: (r) => r.userCount ?? '—' },
    { key: 'createdAt', header: t('created'), render: (r) => r.createdAt ?? '—' },
    {
      key: 'action',
      header: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMenusFor(r)}>
            <LayoutList className="mr-1 h-3.5 w-3.5" />
            {t('manageMenus')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/admin/tenants/${r.uuid}/users`)}
          >
            <UserCog className="mr-1 h-3.5 w-3.5" />
            {t('manageUsers')}
          </Button>
          {r.status === 'active' ? (
            <Button
              variant="danger"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: r.uuid, status: 'suspended' })}
            >
              {t('suspend')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id: r.uuid, status: 'active' })}
            >
              {t('activate')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={<Button onClick={() => setOpen(true)}>{t('newTenant')}</Button>}
      />

      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        rowKey={(r) => r.id}
        emptyMessage={t('empty')}
      />
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      {menusFor && (
        <TenantMenusModal
          open
          tenantUuid={menusFor.uuid}
          tenantName={menusFor.name}
          onClose={() => setMenusFor(null)}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('newTenant')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createTenant.isPending || !name || !shopDomain}
            >
              {tc('create')}
            </Button>
          </>
        }
      >
        <FormRow label={t('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label={t('slug')}>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder={t('slugPlaceholder')}
          />
          <p className="mt-1 text-xs text-gray-400">{t('slugHint')}</p>
        </FormRow>
        <FormRow label={t('shopDomain')}>
          <Input
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="example.myshopify.com"
          />
        </FormRow>
        <FormRow label={t('plan')}>
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </FormRow>
      </Modal>
    </div>
  );
}
