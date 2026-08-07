import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import {
  useCampaigns,
  useCreateCampaign,
  useSendCampaign,
  useUpdateCampaign,
} from './campaigns.hooks';
import type { Campaign, CampaignContent, CampaignLink } from './campaigns.service';

type LinkType = 'none' | 'product' | 'url';

export function CampaignsPage() {
  const { t } = useTranslation('campaigns');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = useCampaigns();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const sendCampaign = useSendCampaign();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');
  const [message, setMessage] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('none');
  const [linkHandle, setLinkHandle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const close = () => {
    setOpen(false);
    setEditing(null);
    setName('');
    setChannel('email');
    setMessage('');
    setLinkType('none');
    setLinkHandle('');
    setLinkUrl('');
  };

  const openCreate = () => {
    close();
    setOpen(true);
  };

  const openEdit = (r: Campaign) => {
    setEditing(r);
    setName(r.name);
    setChannel((r.content?.channel as string) ?? 'email');
    setMessage((r.content?.message as string) ?? '');
    const link = r.content?.link;
    setLinkType(link?.type === 'product' || link?.type === 'url' ? link.type : 'none');
    setLinkHandle(link?.type === 'product' ? (link.handle ?? '') : '');
    setLinkUrl(link?.type === 'url' ? (link.url ?? '') : '');
    setOpen(true);
  };

  const buildLink = (): CampaignLink | undefined => {
    if (linkType === 'product') return { type: 'product', handle: linkHandle.trim() };
    if (linkType === 'url') return { type: 'url', url: linkUrl.trim() };
    return undefined;
  };

  const save = () => {
    // Preserve any content keys this form does not manage (A-9: link lives
    // inside the existing content JSON, alongside message/channel).
    const content: CampaignContent = {
      ...(editing?.content ?? {}),
      channel,
      message,
      link: buildLink(),
    };
    if (!content.link) delete content.link;
    if (editing) {
      updateCampaign.mutate({ id: editing.id, name, content }, { onSuccess: close });
    } else {
      createCampaign.mutate({ name, content }, { onSuccess: close });
    }
  };

  const linkIncomplete =
    (linkType === 'product' && !linkHandle.trim()) || (linkType === 'url' && !linkUrl.trim());
  const saving = createCampaign.isPending || updateCampaign.isPending;

  const columns: Column<Campaign>[] = [
    { key: 'name', header: t('name'), render: (r) => r.name },
    {
      key: 'channel',
      header: t('channel'),
      render: (r) => (r.content?.channel as string) ?? r.channel ?? '—',
    },
    { key: 'status', header: t('status'), render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'link',
      header: t('link'),
      render: (r) => {
        const link = r.content?.link;
        if (!link) return '—';
        return link.type === 'product' ? `${t('linkProduct')}: ${link.handle ?? '—'}` : (link.url ?? '—');
      },
    },
    {
      key: 'audienceSize',
      header: t('audience'),
      render: (r) => (r.audienceSize ?? 0).toLocaleString(),
    },
    { key: 'sentCount', header: t('sent'), render: (r) => (r.sentCount ?? 0).toLocaleString() },
    {
      key: 'createdAt',
      header: t('created'),
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
            {t('edit')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={sendCampaign.isPending}
            onClick={() => sendCampaign.mutate(r.id)}
          >
            {t('send')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={<Button onClick={openCreate}>{t('newCampaign')}</Button>}
      />

      <Table<Campaign>
        columns={columns}
        data={data}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage={t('empty')}
        rowKey={(r) => r.id}
      />

      <Modal
        open={open}
        onClose={close}
        title={editing ? t('editCampaign') : t('newCampaign')}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {tc('cancel')}
            </Button>
            <Button onClick={save} disabled={saving || !name || !message || linkIncomplete}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormRow>
        <FormRow label={t('channel')}>
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">email</option>
            <option value="sms">sms</option>
            <option value="kakao">kakao</option>
          </Select>
        </FormRow>
        <FormRow label={t('message')}>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </FormRow>
        <FormRow label={t('link')}>
          <Select value={linkType} onChange={(e) => setLinkType(e.target.value as LinkType)}>
            <option value="none">{t('linkNone')}</option>
            <option value="product">{t('linkProduct')}</option>
            <option value="url">{t('linkUrl')}</option>
          </Select>
        </FormRow>
        {linkType === 'product' && (
          <FormRow label={t('linkProductHandle')}>
            <Input value={linkHandle} onChange={(e) => setLinkHandle(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">{t('linkProductHelp')}</p>
          </FormRow>
        )}
        {linkType === 'url' && (
          <FormRow label={t('linkUrlField')}>
            <Input
              type="url"
              placeholder="https://"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">{t('linkUrlHelp')}</p>
          </FormRow>
        )}
      </Modal>
    </div>
  );
}
