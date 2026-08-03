import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Table } from '@/components/Table';
import type { Column } from '@/components/Table';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
// Type-only: @ivy/types ships CJS whose runtime exports Rollup cannot see.
import type { WidgetLoginMode } from '@ivy/types';
import {
  useCredentials,
  useIntegration,
  useSaveWidgetSettings,
  useShopifySettings,
  useUpdateCredential,
  useWidgetSettings,
} from './settings.hooks';
import type { CredentialStatus } from './settings.service';
import { ECOMMERCE_PROVIDERS, type EcommerceProvider } from './integration-providers';
import { ProviderTile } from './ProviderTile';
import { ShopifyConfigModal } from './ShopifyConfigModal';
import { IntegrationConfigModal } from './IntegrationConfigModal';
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

/** Which store's config modal is open: Shopify, an e-commerce provider, or none. */
type ConfiguringStore = 'shopify' | EcommerceProvider | null;

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

type InstallPlatform = 'shopify' | 'cafe24' | 'woocommerce' | 'odoo';

function InstallGuideCard() {
  const { t } = useTranslation('settings');
  const { data } = useShopifySettings();
  const [platform, setPlatform] = useState<InstallPlatform>('shopify');
  const [method, setMethod] = useState<InstallMethod>('appEmbed');

  const shop = (data?.shopDomain || '').trim() || 'your-store.example.com';
  const hasShop = Boolean((data?.shopDomain || '').trim());

  // Generic HTML embed — works on any platform that lets you edit theme HTML.
  const htmlSnippet =
    `<!-- ShopTalk widget -->\n` +
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

  const wooSnippet =
    `// ShopTalk widget — add to your (child) theme's functions.php\n` +
    `add_action( 'wp_footer', function () { ?>\n` +
    `  <script>\n` +
    `    window.IVY_WIDGET_CONFIG = {\n` +
    `      shop: ${JSON.stringify(shop)},\n` +
    `      widgetUrl: ${JSON.stringify(WIDGET_URL)}\n` +
    `    };\n` +
    `  </script>\n` +
    `  <script src="${WIDGET_URL}/embed.js" defer></script>\n` +
    `<?php } );`;

  const platforms: { key: InstallPlatform; label: string }[] = [
    { key: 'shopify', label: t('shopify.title') },
    { key: 'cafe24', label: t('integrations.cafe24.title') },
    { key: 'woocommerce', label: t('integrations.woocommerce.title') },
    { key: 'odoo', label: t('integrations.odoo.title') },
  ];

  const methods: { key: InstallMethod; label: string }[] = [
    { key: 'appEmbed', label: t('shopify.install.tabAppEmbed') },
    { key: 'scriptTag', label: t('shopify.install.tabScriptTag') },
    { key: 'manual', label: t('shopify.install.tabManual') },
  ];

  /** Non-Shopify platforms: description + 3 steps + one snippet. */
  const simpleGuide = (key: Exclude<InstallPlatform, 'shopify'>, code: string) => (
    <div className="space-y-3 text-sm text-gray-600">
      <p>{t(`install.${key}.desc`)}</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>{t(`install.${key}.step1`)}</li>
        <li>{t(`install.${key}.step2`)}</li>
        <li>{t(`install.${key}.step3`)}</li>
      </ol>
      <CodeBlock code={code} label={t('shopify.install.copy')} />
    </div>
  );

  return (
    <Card title={t('shopify.install.title')}>
      <p className="mb-1 text-sm text-gray-500">{t('install.subtitle')}</p>
      <p className="mb-4 text-xs text-gray-400">
        {hasShop
          ? t('shopify.install.shopHint', { shop })
          : t('shopify.install.shopMissing')}
      </p>

      {/* Platform tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-100">
        {platforms.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPlatform(p.key)}
            className={
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (platform === p.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {platform === 'shopify' && (
        <>
          <div className="mb-4 flex gap-1">
            {methods.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMethod(tab.key)}
                className={
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (method === tab.key
                    ? 'bg-primary-500/10 text-primary-600'
                    : 'text-gray-500 hover:text-gray-700')
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
              <CodeBlock code={htmlSnippet} label={t('shopify.install.copy')} />
            </div>
          )}
        </>
      )}

      {platform === 'cafe24' && simpleGuide('cafe24', htmlSnippet)}
      {platform === 'woocommerce' && simpleGuide('woocommerce', wooSnippet)}
      {platform === 'odoo' && simpleGuide('odoo', htmlSnippet)}
    </Card>
  );
}

/** Shopify summary tile — data comes from the dedicated Shopify settings view. */
function ShopifyTile({ onConfigure }: { onConfigure: () => void }) {
  const { t } = useTranslation('settings');
  const { data } = useShopifySettings();
  return (
    <ProviderTile
      title={t('shopify.title')}
      subtitle={data?.shopDomain || t('shopify.shopDomainPlaceholder')}
      status={data?.integration?.status}
      configured={data?.credential.configured}
      lastTested={data?.integration?.lastSyncAt}
      onConfigure={onConfigure}
    />
  );
}

/** Generic e-commerce provider summary tile (cafe24/woocommerce/odoo/haravan). */
function EcommerceTile({
  provider,
  onConfigure,
}: {
  provider: EcommerceProvider;
  onConfigure: () => void;
}) {
  const { t } = useTranslation('settings');
  const { data } = useIntegration(provider);
  return (
    <ProviderTile
      title={t(`integrations.${provider}.title`)}
      subtitle={t(`integrations.${provider}.subtitle`)}
      status={data?.integration?.status}
      configured={data?.credential.configured}
      lastTested={data?.integration?.lastSyncAt}
      onConfigure={onConfigure}
    />
  );
}

/**
 * Widget sign-in behavior (PLN-Widget-Login-Redirect-Orders): whole-tab redirect
 * to the store's hosted login (default) vs a popup window. Delivered to the
 * widget via session/ensure; takes effect on the shopper's next page load.
 */
function WidgetBehaviorCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading } = useWidgetSettings();
  const save = useSaveWidgetSettings();
  // Local pick, if any; otherwise whatever is stored (redirect until loaded).
  const [picked, setPicked] = useState<WidgetLoginMode | null>(null);
  const value: WidgetLoginMode = picked ?? data?.loginMode ?? 'redirect';
  const dirty = data != null && value !== data.loginMode;

  return (
    <Card title={t('widgetBehavior.title')}>
      <p className="mb-4 text-sm text-gray-500">{t('widgetBehavior.desc')}</p>
      <div className="max-w-md">
        <FormRow label={t('widgetBehavior.loginMode')}>
          <Select
            value={value}
            disabled={isLoading}
            onChange={(e) => setPicked(e.target.value as WidgetLoginMode)}
          >
            <option value="redirect">{t('widgetBehavior.redirect')}</option>
            <option value="popup">{t('widgetBehavior.popup')}</option>
          </Select>
        </FormRow>
        <p className="mb-4 text-xs text-gray-400">
          {value === 'popup' ? t('widgetBehavior.popupHint') : t('widgetBehavior.redirectHint')}
        </p>
        <Button onClick={() => save.mutate(value)} disabled={!dirty || save.isPending}>
          {save.isPending ? tc('saving') : tc('save')}
        </Button>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = useCredentials();
  const updateCredential = useUpdateCredential();

  const [configuring, setConfiguring] = useState<ConfiguringStore>(null);
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

      {/* Store integrations as compact cards; each opens its config modal. */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t('storesTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ShopifyTile onConfigure={() => setConfiguring('shopify')} />
          {ECOMMERCE_PROVIDERS.map((p) => (
            <EcommerceTile key={p} provider={p} onConfigure={() => setConfiguring(p)} />
          ))}
        </div>
      </section>

      <InstallGuideCard />

      <WidgetBehaviorCard />

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

      <ShopifyConfigModal open={configuring === 'shopify'} onClose={() => setConfiguring(null)} />
      {ECOMMERCE_PROVIDERS.map((p) => (
        <IntegrationConfigModal
          key={p}
          provider={p}
          open={configuring === p}
          onClose={() => setConfiguring(null)}
        />
      ))}

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
