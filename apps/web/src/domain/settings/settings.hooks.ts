import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  WidgetHeaderStyle,
  WidgetLoginMode,
  WidgetTab,
  WidgetTabPosition,
} from '@ivy/types';
import { settingsService } from './settings.service';
import type { SaveShopifyBody, UpdateCredentialBody, WidgetCopyDraft } from './settings.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useWidgetSettings = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['widget-settings', tenantKey],
    queryFn: () => settingsService.widgetSettings(),
  });
};

export function useSaveWidgetSettings() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (v: {
      loginMode: WidgetLoginMode;
      timezone?: string | null;
      copy?: WidgetCopyDraft;
      tabs?: WidgetTab[];
      tabPosition?: WidgetTabPosition;
    }) =>
      settingsService.saveWidgetSettings(v.loginMode, v.timezone, v.copy, v.tabs, v.tabPosition),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widget-settings', tenantKey] });
      // Success auto-closes; errors stay until dismissed (dev-kit §4.3).
      toast.success(t('widgetBehavior.saved'));
    },
    onError: (e: Error) => {
      toast.error(e.message || t('widgetBehavior.saveError'), { sticky: true });
    },
  });
}

export const useCredentials = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['credentials', tenantKey],
    queryFn: () => settingsService.credentials(),
  });
};

export function useUpdateCredential() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ provider, body }: { provider: string; body: UpdateCredentialBody }) =>
      settingsService.updateCredential(provider, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials', tenantKey] });
      toast.success('Credential updated.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to update credential.');
    },
  });
}

export const useShopifySettings = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['shopify-settings', tenantKey],
    queryFn: () => settingsService.shopify(),
  });
};

export function useSaveShopify() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: SaveShopifyBody) => settingsService.saveShopify(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopify-settings', tenantKey] });
      toast.success('Shopify settings saved.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to save Shopify settings.');
    },
  });
}

export function useTestShopify() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: () => settingsService.testShopify(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopify-settings', tenantKey] });
      if (res.ok) toast.success(res.detail);
      else toast.error(res.detail);
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Shopify test failed.');
    },
  });
}

export function useSyncShopify() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: () => settingsService.syncShopify(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopify-settings', tenantKey] });
      if (res.ok) toast.success(res.detail);
      else toast.error(res.detail);
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Shopify sync failed.');
    },
  });
}

export function useRegisterShopifyWebhooks() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: () => settingsService.registerShopifyWebhooks(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shopify-settings', tenantKey] });
      if (res.ok) toast.success(res.detail);
      else toast.error(res.detail);
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Webhook registration failed.');
    },
  });
}

// ---- Generic e-commerce integrations (cafe24 / woocommerce / odoo / haravan) ----

export const useIntegration = (provider: string) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['integration', provider, tenantKey],
    queryFn: () => settingsService.integration(provider),
  });
};

export function useSaveIntegration(provider: string) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (config: Record<string, string>) =>
      settingsService.saveIntegration(provider, config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integration', provider, tenantKey] });
      toast.success('Integration settings saved.');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Failed to save integration settings.');
    },
  });
}

export function useTestIntegration(provider: string) {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: () => settingsService.testIntegration(provider),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['integration', provider, tenantKey] });
      if (res.ok) toast.success(res.detail);
      else toast.error(res.detail);
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Integration test failed.');
    },
  });
}

/** Storefront origin — decides whether product citations become links. */
export function useStorefront() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['storefront', tenantKey],
    queryFn: () => settingsService.storefront(),
  });
}

export function useUpdateStorefront() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (url: string) => settingsService.updateStorefront(url),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['storefront', tenantKey] });
      toast.success(r.storefrontUrl ? 'Storefront saved' : 'Storefront cleared');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useNotificationChannels() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['notification-channels', tenantKey],
    queryFn: settingsService.notificationChannels,
  });
}

export function useSaveNotificationChannels() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (channels: Record<string, string[]>) =>
      settingsService.saveNotificationChannels(channels),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-channels', tenantKey] });
      // Success auto-closes; errors stay until dismissed (dev-kit §4.3).
      toast.success(t('notifChannels.saved'));
    },
    onError: (e: Error) => {
      toast.error(e.message || t('notifChannels.saveError'), { sticky: true });
    },
  });
}

export function useWidgetTheme() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['widget-theme', tenantKey],
    queryFn: settingsService.widgetTheme,
  });
}

export function useSaveWidgetTheme() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (v: { brand: string; headerStyle: WidgetHeaderStyle }) =>
      settingsService.saveWidgetTheme(v.brand, v.headerStyle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widget-theme', tenantKey] });
      toast.success(t('widgetTheme.saved'));
    },
    onError: (e: Error) => {
      toast.error(e.message || t('widgetTheme.saveError'), { sticky: true });
    },
  });
}
