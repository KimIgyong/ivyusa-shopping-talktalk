import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { useUsers, useJobLabels, useInviteUser, useUpdateUser } from './users.hooks';
import type { JobLabel, TenantUser } from './users.service';

const RANKS = ['master', 'director', 'manager', 'staff'] as const;
const STATUSES = ['active', 'suspended'] as const;

function fmtDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function LabelCheckboxes({
  labels,
  selected,
  onToggle,
}: {
  labels: JobLabel[];
  selected: string[];
  onToggle: (code: string) => void;
}) {
  if (labels.length === 0) {
    return <p className="text-sm text-gray-400">No job labels available.</p>;
  }
  return (
    <div className="space-y-2">
      {labels.map((l) => (
        <label key={l.code} className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={selected.includes(l.code)}
            onChange={() => onToggle(l.code)}
            className="h-4 w-4 rounded border-gray-300"
          />
          {l.name}
        </label>
      ))}
    </div>
  );
}

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers();
  const { data: jobLabels } = useJobLabels();
  const inviteUser = useInviteUser();
  const updateUser = useUpdateUser();

  const labels = useMemo<JobLabel[]>(() => jobLabels ?? [], [jobLabels]);
  const labelNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    labels.forEach((l) => m.set(l.code, l.name));
    return m;
  }, [labels]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRank, setInviteRank] = useState<string>('staff');
  const [inviteCodes, setInviteCodes] = useState<string[]>([]);

  const [editing, setEditing] = useState<TenantUser | null>(null);
  const [editRank, setEditRank] = useState<string>('staff');
  const [editCodes, setEditCodes] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<string>('active');

  const toggle = (codes: string[], code: string): string[] =>
    codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];

  const openInvite = () => {
    setEmail('');
    setInviteRank('staff');
    setInviteCodes([]);
    setInviteOpen(true);
  };

  const onInvite = async () => {
    await inviteUser.mutateAsync({ email, rank: inviteRank, label_codes: inviteCodes });
    setInviteOpen(false);
  };

  const openEdit = (u: TenantUser) => {
    setEditing(u);
    setEditRank(u.rank);
    setEditCodes(u.labels ?? []);
    setEditStatus(u.status ?? 'active');
  };

  const onUpdate = async () => {
    if (!editing) return;
    await updateUser.mutateAsync({
      id: editing.id,
      body: { rank: editRank, label_codes: editCodes, status: editStatus },
    });
    setEditing(null);
  };

  const columns: Column<TenantUser>[] = [
    { key: 'email', header: 'Email', render: (u) => u.email },
    { key: 'rank', header: 'Rank', render: (u) => <Badge tone="primary">{u.rank}</Badge> },
    {
      key: 'labels',
      header: 'Labels',
      render: (u) => {
        const codes = u.labels ?? [];
        if (codes.length === 0) return '—';
        return (
          <div className="flex flex-wrap gap-1">
            {codes.map((c) => (
              <Badge key={c}>{labelNameByCode.get(c) ?? c}</Badge>
            ))}
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'createdAt', header: 'Created', render: (u) => fmtDate(u.createdAt) },
    {
      key: 'action',
      header: '',
      render: (u) => (
        <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage team members and their access."
        action={
          <Button onClick={openInvite}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite user
          </Button>
        }
      />

      <Card>
        <Table<TenantUser>
          columns={columns}
          data={users}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="No users yet."
          rowKey={(u) => u.id}
        />
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite user"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onInvite} disabled={inviteUser.isPending || !email}>
              {inviteUser.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </>
        }
      >
        <FormRow label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </FormRow>
        <FormRow label="Rank">
          <Select value={inviteRank} onChange={(e) => setInviteRank(e.target.value)}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Job labels">
          <LabelCheckboxes
            labels={labels}
            selected={inviteCodes}
            onToggle={(code) => setInviteCodes((prev) => toggle(prev, code))}
          />
        </FormRow>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit user"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={onUpdate} disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <FormRow label="Rank">
          <Select value={editRank} onChange={(e) => setEditRank(e.target.value)}>
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Job labels">
          <LabelCheckboxes
            labels={labels}
            selected={editCodes}
            onToggle={(code) => setEditCodes((prev) => toggle(prev, code))}
          />
        </FormRow>
        <FormRow label="Status">
          <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FormRow>
      </Modal>
    </div>
  );
}
