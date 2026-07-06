import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { FormRow, Input } from '@/components/Field';
import {
  useCredentials,
  useSaveShopify,
  useShopifySettings,
  useTestShopify,
  useUpdateCredential,
} from './settings.hooks';
import type { CredentialStatus } from './settings.service';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function ShopifyCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useShopifySettings();
  const save = useSaveShopify();
  const test = useTestShopify();

  const [shopDomain, setShopDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  // Seed the shop-domain input from the server once loaded.
  useEffect(() => {
    if (data) setShopDomain(data.shopDomain ?? '');
  }, [data]);

  const onSave = async () => {
    await save.mutateAsync({
      shop_domain: shopDomain.trim(),
      access_token: accessToken.trim() || undefined,
      api_key: apiKey.trim() || undefined,
      api_secret: apiSecret.trim() || undefined,
    });
    // Clear secret inputs after save (never re-shown).
    setAccessToken('');
    setApiKey('');
    setApiSecret('');
  };

  const integ = data?.integration;
  const statusTone =
    integ?.status === 'connected' ? 'success' : integ?.status === 'error' ? 'error' : undefined;

  return (
    <Card title={t('shopify.title')}>
      <p className="mb-4 text-sm text-gray-500">{t('shopify.subtitle')}</p>

      <FormRow label={t('shopify.shopDomain')}>
        <Input
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
          placeholder={t('shopify.shopDomainPlaceholder')}
          autoComplete="off"
        />
      </FormRow>

      <FormRow label={t('shopify.accessToken')}>
        <Input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={
            data?.credential.configured
              ? t('shopify.accessTokenConfigured')
              : t('shopify.accessTokenPlaceholder')
          }
          autoComplete="off"
        />
      </FormRow>

      <FormRow label={t('shopify.apiKeyOptional')}>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t('shopify.apiKeyPlaceholder')}
          autoComplete="off"
        />
      </FormRow>

      <FormRow label={t('shopify.apiSecretOptional')}>
        <Input
          type="password"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          placeholder={t('shopify.apiSecretPlaceholder')}
          autoComplete="off"
        />
      </FormRow>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onSave} disabled={isLoading || save.isPending || !shopDomain.trim()}>
          {save.isPending ? tc('saving') : tc('save')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => test.mutate()}
          disabled={test.isPending || !data?.credential.configured}
        >
          {test.isPending ? t('shopify.testing') : t('shopify.testConnection')}
        </Button>
      </div>

      <div className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{t('shopify.connectionStatus')}:</span>
          {statusTone ? (
            <Badge tone={statusTone}>{t(`shopify.state.${integ?.status}`)}</Badge>
          ) : (
            <Badge>{t('shopify.state.unknown')}</Badge>
          )}
        </div>
        <div className="text-gray-500">
          {t('shopify.credential')}:{' '}
          {data?.credential.configured ? t('connected') : t('notSet')}
        </div>
        {integ?.detail && <div className="text-gray-500">{integ.detail}</div>}
        <div className="text-xs text-gray-400">
          {t('shopify.lastTested')}: {fmtDate(integ?.lastSyncAt)}
        </div>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = useCredentials();
  const updateCredential = useUpdateCredential();

  const [editing, setEditing] = useState<CredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');

  const openEdit = (c: CredentialStatus) => {
    setEditing(c);
    setApiKey('');
    setSecret('');
  };

  const onSave = async () => {
    if (!editing) return;
    await updateCredential.mutateAsync({
      provider: editing.provider,
      body: { apiKey, secret },
    });
    setEditing(null);
  };

  const columns: Column<CredentialStatus>[] = [
    { key: 'provider', header: t('provider'), render: (c) => c.provider },
    {
      key: 'configured',
      header: t('status'),
      render: (c) =>
        c.configured ? <Badge tone="success">{t('connected')}</Badge> : <Badge>{t('notSet')}</Badge>,
    },
    {
      key: 'maskedKey',
      header: t('key'),
      render: (c) => <span className="font-mono text-xs">{c.maskedKey || '—'}</span>,
    },
    { key: 'lastUpdatedAt', header: t('lastUpdated'), render: (c) => fmtDate(c.lastUpdatedAt) },
    {
      key: 'action',
      header: '',
      render: (c) => (
        <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
          {tc('update')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <ShopifyCard />

      <Card title={t('integrationCredentials')}>
        <Table<CredentialStatus>
          columns={columns}
          data={data}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage={t('empty')}
          rowKey={(c) => c.provider}
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t('updateProvider', { provider: editing.provider }) : t('updateCredential')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {tc('cancel')}
            </Button>
            <Button onClick={onSave} disabled={updateCredential.isPending}>
              {updateCredential.isPending ? tc('saving') : tc('save')}
            </Button>
          </>
        }
      >
        <FormRow label={t('apiKey')}>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('apiKeyPlaceholder')}
            autoComplete="off"
          />
        </FormRow>
        <FormRow label={t('secretOptional')}>
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={t('secretPlaceholder')}
            autoComplete="off"
          />
        </FormRow>
      </Modal>
    </div>
  );
}
