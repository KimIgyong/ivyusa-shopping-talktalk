import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import { toast } from '@/store/toast-store';
import { settingsService } from './settings.service';
import { useIntegration } from './settings.hooks';

/**
 * Cafe24 OAuth connect (PLN-260807 P-A1). Unlike the generic credential modal,
 * this begins the Authorization-Code flow: enter the mall id, and the browser is
 * sent to Cafe24's consent screen; the public callback stores the tenant's token.
 */
export function Cafe24ConnectCard() {
  const { t } = useTranslation('settings');
  const { data } = useIntegration('cafe24');
  const [mallId, setMallId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingProducts, setSyncingProducts] = useState(false);

  // Surface the OAuth round-trip outcome the callback appended to the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connected = p.get('cafe24_connected');
    const failure = p.get('cafe24_error');
    if (connected) toast.success(t('cafe24.oauth.connectedToast', { mall: connected }));
    // Cafe24's own refusal reason, when it gave one. `invalid_scope` and
    // `access_denied` are fixed in Cafe24's developer admin, not here, so a
    // generic "connect failed" sends the operator looking in the wrong place.
    else if (failure === 'invalid_scope') toast.error(t('cafe24.oauth.errorInvalidScope'));
    else if (failure === 'access_denied') toast.error(t('cafe24.oauth.errorAccessDenied'));
    else if (failure) toast.error(t('cafe24.oauth.connectFailed'));
    if (connected || p.get('cafe24_error')) {
      p.delete('cafe24_connected');
      p.delete('cafe24_error');
      const qs = p.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [t]);

  const connect = async () => {
    const mall = mallId.trim();
    if (!mall) return;
    setConnecting(true);
    try {
      const { authorizeUrl } = await settingsService.connectCafe24(mall);
      window.location.href = authorizeUrl;
    } catch {
      toast.error(t('cafe24.oauth.connectFailed'));
      setConnecting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await settingsService.syncCafe24();
      if (r.ok) toast.success(r.detail);
      else toast.error(r.detail);
    } catch {
      toast.error(t('cafe24.oauth.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Pull the catalogue into products_cache. It stops there on purpose: the
   * knowledge conversion is previewed and approved on the Knowledge page, so the
   * toast points the operator at that next step rather than implying the
   * products are already answerable.
   */
  const syncProducts = async () => {
    setSyncingProducts(true);
    try {
      const r = await settingsService.syncCafe24Products();
      if (r.ok) {
        toast.success(t('cafe24.oauth.productsSynced', { synced: r.synced, archived: r.archived }));
      } else {
        toast.error(r.detail);
      }
    } catch {
      toast.error(t('cafe24.oauth.syncProductsFailed'));
    } finally {
      setSyncingProducts(false);
    }
  };

  const connected =
    data?.integration?.status === 'connected' || Boolean(data?.credential?.configured);

  return (
    <Card title={t('cafe24.oauth.title')}>
      <div className="space-y-2">
        <p className="text-xs text-gray-500">{t('cafe24.oauth.hint')}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm">{t('cafe24.oauth.status')}</span>
          <StatusBadge status={connected ? 'connected' : 'disconnected'} />
        </div>
        <FormRow label={t('cafe24.oauth.mallId')}>
          <div className="flex items-center gap-2">
            <Input
              value={mallId}
              placeholder="amoebaorder"
              onChange={(e) => setMallId(e.target.value)}
            />
            <span className="text-sm text-gray-400">.cafe24.com</span>
          </div>
        </FormRow>
        <div className="flex gap-2">
          <Button disabled={!mallId.trim() || connecting} onClick={connect}>
            {t('cafe24.oauth.connect')}
          </Button>
          {connected && (
            <>
              <Button variant="secondary" disabled={syncing} onClick={sync}>
                {t('cafe24.oauth.syncNow')}
              </Button>
              <Button variant="secondary" disabled={syncingProducts} onClick={syncProducts}>
                {t('cafe24.oauth.syncProducts')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
