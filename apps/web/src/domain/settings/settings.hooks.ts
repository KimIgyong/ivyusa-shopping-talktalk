import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsService } from './settings.service';
import type { SaveShopifyBody, UpdateCredentialBody } from './settings.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

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
