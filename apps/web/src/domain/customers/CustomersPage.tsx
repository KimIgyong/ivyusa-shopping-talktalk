import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { FormRow, Select } from '@/components/Field';
import { useCustomers, useUpdateTier } from './customers.hooks';
import type { Customer } from './customers.service';

const PAGE_SIZE = 20;
const TIERS = ['bronze', 'silver', 'gold', 'vip'] as const;

function fmtMoney(value?: number): string {
  return typeof value === 'number' ? `$${value.toLocaleString()}` : '—';
}

function fmtDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function CustomersPage() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [tier, setTier] = useState<string>('bronze');

  const { data, isLoading, error } = useCustomers({ page, pageSize: PAGE_SIZE });
  const updateTier = useUpdateTier();

  const openEdit = (c: Customer) => {
    setEditing(c);
    setTier(c.tier ?? 'bronze');
  };

  const onSave = async () => {
    if (!editing) return;
    await updateTier.mutateAsync({ id: editing.id, tier });
    setEditing(null);
  };

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Name', render: (c) => c.name ?? '—' },
    { key: 'email', header: 'Email', render: (c) => c.email ?? '—' },
    {
      key: 'tier',
      header: 'Tier',
      render: (c) => (c.tier ? <Badge tone="primary">{c.tier}</Badge> : '—'),
    },
    { key: 'orders', header: 'Orders', render: (c) => c.orders ?? 0 },
    { key: 'totalSpent', header: 'Total spent', render: (c) => fmtMoney(c.totalSpent) },
    { key: 'createdAt', header: 'Created', render: (c) => fmtDate(c.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            openEdit(c);
          }}
        >
          Edit tier
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Customers" subtitle="Manage customer accounts and tiers" />

      <Table
        columns={columns}
        data={data?.items}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="No customers found."
        rowKey={(c) => c.id}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit customer tier"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={updateTier.isPending}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <FormRow label={`Tier for ${editing.name ?? editing.id}`}>
            <Select value={tier} onChange={(e) => setTier(e.target.value)}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormRow>
        )}
      </Modal>
    </div>
  );
}
