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
  useRegisterShopifyWebhooks,
  useSaveShopify,
  useShopifySettings,
  useSyncShopify,
  useTestShopify,
  useUpdateCredential,
} from './settings.hooks';
import type { CredentialStatus } from './settings.service';
import { toast } from '@/store/toast-store';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

// Where the widget SPA + embed.js are served. Env override lets each build target
// its own host; default is the staging deployment (served under /widget).
const WIDGET_URL = (
  (import.meta.env.VITE_WIDGET_URL as string | undefined) || 'https://shoptalk.amoeba.site/widget'
).replace(/\/+$/, '');

type InstallMethod = 'appEmbed' | 'scriptTag' | 'manual';

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const { t } = useTranslation('settings');
  const onCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) toast.success(t('shopify.install.copied'));
    else toast.error(t('shopify.install.copyFailed'));
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 pr-24 text-xs leading-relaxed text-gray-100">
        <code>{code}</code>
      </pre>
      <Button
        variant="secondary"
        size="sm"
        className="absolute right-2 top-2"
        onClick={onCopy}
        aria-label={label}
      >
        {t('shopify.install.copy')}
      </Button>
    </div>
  );
}

function InstallGuideCard() {
  const { t } = useTranslation('settings');
  const { data } = useShopifySettings();
  const [method, setMethod] = useState<InstallMethod>('appEmbed');

  const shop = (data?.shopDomain || '').trim() || 'your-store.myshopify.com';
  const hasShop = Boolean((data?.shopDomain || '').trim());

  const manualSnippet =
    `<!-- IVY USA TalkTalk widget -->\n` +
    `<script>\n` +
    `  window.IVY_WIDGET_CONFIG = {\n` +
    `    shop: ${JSON.stringify(shop)},\n` +
    `    widgetUrl: ${JSON.stringify(WIDGET_URL)}\n` +
    `  };\n` +
    `</script>\n` +
    `<script src="${WIDGET_URL}/embed.js" defer></script>`;

  const scriptTagSnippet =
    `POST https://${shop}/admin/api/2024-10/script_tags.json\n` +
    `{\n` +
    `  "script_tag": {\n` +
    `    "event": "onload",\n` +
    `    "src": "${WIDGET_URL}/embed.js?shop=${encodeURIComponent(shop)}"\n` +
    `  }\n` +
    `}`;

  const tabs: { key: InstallMethod; label: string }[] = [
    { key: 'appEmbed', label: t('shopify.install.tabAppEmbed') },
    { key: 'scriptTag', label: t('shopify.install.tabScriptTag') },
    { key: 'manual', label: t('shopify.install.tabManual') },
  ];

  return (
    <Card title={t('shopify.install.title')}>
      <p className="mb-1 text-sm text-gray-500">{t('shopify.install.subtitle')}</p>
      <p className="mb-4 text-xs text-gray-400">
        {hasShop
          ? t('shopify.install.shopHint', { shop })
          : t('shopify.install.shopMissing')}
      </p>

      <div className="mb-4 flex gap-1 border-b border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMethod(tab.key)}
            className={
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (method === tab.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {method === 'appEmbed' && (
        <div className="space-y-2 text-sm text-gray-600">
          <p>{t('shopify.install.appEmbed.desc')}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('shopify.install.appEmbed.step1')}</li>
            <li>{t('shopify.install.appEmbed.step2')}</li>
            <li>{t('shopify.install.appEmbed.step3')}</li>
          </ol>
        </div>
      )}

      {method === 'scriptTag' && (
        <div className="space-y-3 text-sm text-gray-600">
          <p>{t('shopify.install.scriptTag.desc')}</p>
          <CodeBlock code={scriptTagSnippet} label={t('shopify.install.copy')} />
          <p className="text-xs text-gray-400">{t('shopify.install.scriptTag.note')}</p>
        </div>
      )}

      {method === 'manual' && (
        <div className="space-y-3 text-sm text-gray-600">
          <p>{t('shopify.install.manual.desc')}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('shopify.install.manual.step1')}</li>
            <li>{t('shopify.install.manual.step2')}</li>
            <li>{t('shopify.install.manual.step3')}</li>
          </ol>
          <CodeBlock code={manualSnippet} label={t('shopify.install.copy')} />
        </div>
      )}
    </Card>
  );
}

function ShopifyCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useShopifySettings();
  const save = useSaveShopify();
  const test = useTestShopify();
  const sync = useSyncShopify();
  const registerWebhooks = useRegisterShopifyWebhooks();

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
        <Button
          variant="secondary"
          onClick={() => sync.mutate()}
          disabled={sync.isPending || !data?.credential.configured}
        >
          {sync.isPending ? t('shopify.syncing') : t('shopify.syncNow')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => registerWebhooks.mutate()}
          disabled={registerWebhooks.isPending || !data?.credential.configured}
        >
          {registerWebhooks.isPending ? t('shopify.registering') : t('shopify.registerWebhooks')}
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

      <InstallGuideCard />

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
