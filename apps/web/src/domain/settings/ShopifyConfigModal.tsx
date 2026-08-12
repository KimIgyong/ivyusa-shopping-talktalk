import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { FormRow, Input } from '@/components/Field';
import { isShopifyDomain } from './SettingsPage';
import {
  useRegisterShopifyWebhooks,
  useSaveShopify,
  useShopifySettings,
  useSyncShopify,
  useTestShopify,
} from './settings.hooks';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/** Shopify connection settings in a modal (domain + credentials + test/sync/webhooks). */
export function ShopifyConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Modal
      open={open}
      onClose={onClose}
      title={t('shopify.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc('close')}
          </Button>
          <Button onClick={onSave} disabled={isLoading || save.isPending || !shopDomain.trim()}>
            {save.isPending ? tc('saving') : tc('save')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-gray-500">{t('shopify.subtitle')}</p>

      {shopDomain.trim() && !isShopifyDomain(shopDomain) && (
        // The field doubles as the tenant's store domain for any platform, so a
        // Cafe24 mall legitimately lives here — say so instead of letting it
        // look like a misconfigured Shopify store.
        <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          {t('shopify.nonShopifyDomain')}
        </p>
      )}
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
    </Modal>
  );
}
