import { useState } from 'react';
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
import type { Tenant } from './admin.service';

const PAGE_SIZE = 20;
const PLANS = ['starter', 'growth', 'enterprise'];

export function TenantsPage() {
  const { t } = useTranslation('tenants');
  const { t: tc } = useTranslation('common');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [plan, setPlan] = useState(PLANS[0]);

  const { data, isLoading, error } = useTenants({ page, pageSize: PAGE_SIZE });
  const createTenant = useCreateTenant();
  const setStatus = useSetTenantStatus();

  const resetForm = () => {
    setName('');
    setShopDomain('');
    setPlan(PLANS[0]);
  };

  const handleCreate = () => {
    createTenant.mutate(
      { name, shopDomain, plan },
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
      render: (r) =>
        r.status === 'active' ? (
          <Button
            variant="danger"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: r.id, status: 'suspended' })}
          >
            {t('suspend')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: r.id, status: 'active' })}
          >
            {t('activate')}
          </Button>
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
