import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import {
  useSources,
  useCreateSource,
  useToggleSource,
  useDocuments,
  useCreateDocument,
  useDeleteDocument,
} from './knowledge.hooks';
import type { KnowledgeSource, KnowledgeDocument } from './knowledge.service';

export function KnowledgePage() {
  const sources = useSources();
  const createSource = useCreateSource();
  const toggleSource = useToggleSource();
  const documents = useDocuments();
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();

  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('url');

  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docSourceId, setDocSourceId] = useState('');
  const [docContent, setDocContent] = useState('');

  const sourceList = sources.data ?? [];

  const sourceName_ = (id?: string) =>
    sourceList.find((s) => s.id === id)?.name ?? '—';

  const closeSource = () => {
    setSourceOpen(false);
    setSourceName('');
    setSourceType('url');
  };

  const saveSource = () => {
    createSource.mutate({ name: sourceName, type: sourceType }, { onSuccess: closeSource });
  };

  const closeDoc = () => {
    setDocOpen(false);
    setDocTitle('');
    setDocSourceId('');
    setDocContent('');
  };

  const saveDoc = () => {
    createDocument.mutate(
      {
        title: docTitle,
        sourceId: docSourceId || undefined,
        content: docContent || undefined,
      },
      { onSuccess: closeDoc },
    );
  };

  const removeDoc = (id: string) => {
    if (window.confirm('Delete this document?')) {
      deleteDocument.mutate(id);
    }
  };

  const sourceColumns: Column<KnowledgeSource>[] = [
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'type', header: 'Type', render: (r) => r.type ?? '—' },
    {
      key: 'documentCount',
      header: 'Documents',
      render: (r) => (r.documentCount ?? 0).toLocaleString(),
    },
    {
      key: 'enabled',
      header: 'Enabled',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={toggleSource.isPending}
          onClick={() => toggleSource.mutate({ id: r.id, enabled: !r.enabled })}
        >
          <Badge tone={r.enabled ? 'success' : 'gray'}>
            {r.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </Button>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
    },
  ];

  const docColumns: Column<KnowledgeDocument>[] = [
    { key: 'title', header: 'Title', render: (r) => r.title },
    { key: 'source', header: 'Source', render: (r) => sourceName_(r.sourceId) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'createdAt',
      header: 'Created',
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button
          variant="danger"
          size="sm"
          disabled={deleteDocument.isPending}
          onClick={() => removeDoc(r.id)}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Knowledge" subtitle="Manage sources and documents" />

      <div className="space-y-6">
        <Card
          title="Sources"
          action={<Button onClick={() => setSourceOpen(true)}>Add source</Button>}
        >
          <Table<KnowledgeSource>
            columns={sourceColumns}
            data={sources.data}
            loading={sources.isLoading}
            error={sources.error ? (sources.error as Error).message : null}
            emptyMessage="No sources yet."
            rowKey={(r) => r.id}
          />
        </Card>

        <Card
          title="Documents"
          action={<Button onClick={() => setDocOpen(true)}>Add document</Button>}
        >
          <Table<KnowledgeDocument>
            columns={docColumns}
            data={documents.data}
            loading={documents.isLoading}
            error={documents.error ? (documents.error as Error).message : null}
            emptyMessage="No documents yet."
            rowKey={(r) => r.id}
          />
        </Card>
      </div>

      <Modal
        open={sourceOpen}
        onClose={closeSource}
        title="Add source"
        footer={
          <>
            <Button variant="ghost" onClick={closeSource}>
              Cancel
            </Button>
            <Button onClick={saveSource} disabled={createSource.isPending || !sourceName}>
              Save
            </Button>
          </>
        }
      >
        <FormRow label="Name">
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
        </FormRow>
        <FormRow label="Type">
          <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            <option value="url">url</option>
            <option value="file">file</option>
            <option value="faq">faq</option>
            <option value="manual">manual</option>
          </Select>
        </FormRow>
      </Modal>

      <Modal
        open={docOpen}
        onClose={closeDoc}
        title="Add document"
        footer={
          <>
            <Button variant="ghost" onClick={closeDoc}>
              Cancel
            </Button>
            <Button onClick={saveDoc} disabled={createDocument.isPending || !docTitle}>
              Save
            </Button>
          </>
        }
      >
        <FormRow label="Title">
          <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
        </FormRow>
        <FormRow label="Source">
          <Select value={docSourceId} onChange={(e) => setDocSourceId(e.target.value)}>
            <option value="">— none —</option>
            {sourceList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Content">
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            rows={4}
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
          />
        </FormRow>
      </Modal>
    </div>
  );
}
