import { useState } from 'react';
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
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState(PLANS[0]);

  const { data, isLoading, error } = useTenants({ page, pageSize: PAGE_SIZE });
  const createTenant = useCreateTenant();
  const setStatus = useSetTenantStatus();

  const resetForm = () => {
    setName('');
    setSlug('');
    setPlan(PLANS[0]);
  };

  const handleCreate = () => {
    createTenant.mutate(
      { name, slug, plan },
      {
        onSuccess: () => {
          setOpen(false);
          resetForm();
        },
      },
    );
  };

  const columns: Column<Tenant>[] = [
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'slug', header: 'Slug', render: (r) => r.slug ?? '—' },
    {
      key: 'plan',
      header: 'Plan',
      render: (r) => (r.plan ? <Badge tone="primary">{r.plan}</Badge> : '—'),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'userCount', header: 'Users', render: (r) => r.userCount ?? '—' },
    { key: 'createdAt', header: 'Created', render: (r) => r.createdAt ?? '—' },
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
            Suspend
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: r.id, status: 'active' })}
          >
            Activate
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tenants"
        action={<Button onClick={() => setOpen(true)}>New tenant</Button>}
      />

      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        rowKey={(r) => r.id}
        emptyMessage="No tenants."
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
        title="New tenant"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createTenant.isPending || !name || !slug}
            >
              Create
            </Button>
          </>
        }
      >
        <FormRow label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label="Slug">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </FormRow>
        <FormRow label="Plan">
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
