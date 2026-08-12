import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messengerService } from './messenger.service';
import type { UpdateChannelBody, UpsertChannelBody } from './messenger.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

const key = (tenantKey: string | number) => ['messenger-channels', tenantKey];

export const useMessengerChannels = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: key(tenantKey),
    queryFn: () => messengerService.list(),
  });
};

export function useSaveMessengerChannel() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: UpsertChannelBody) => messengerService.upsert(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(tenantKey) });
      // Success auto-closes, errors stay until dismissed (dev-kit §4.3).
      toast.success(t('messenger.saved'));
    },
    onError: (e: Error) => toast.error(e.message || t('messenger.saveError'), { sticky: true }),
  });
}

export function useUpdateMessengerChannel() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateChannelBody }) =>
      messengerService.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(tenantKey) });
      toast.success(t('messenger.saved'));
    },
    onError: (e: Error) => toast.error(e.message || t('messenger.saveError'), { sticky: true }),
  });
}

export function useDeleteMessengerChannel() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => messengerService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(tenantKey) });
      toast.success(t('messenger.disconnected'));
    },
    onError: (e: Error) => toast.error(e.message || t('messenger.disconnectError'), { sticky: true }),
  });
}

export function useTestMessengerChannel() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => messengerService.test(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: key(tenantKey) });
      // The provider can answer "reachable but wrong credential" — that is a
      // failed test, not a failed request, so it must not read as success.
      if (result.ok) toast.success(t('messenger.testOk', { detail: result.detail }));
      else toast.error(t('messenger.testFailed', { detail: result.detail }), { sticky: true });
    },
    onError: (e: Error) => toast.error(e.message || t('messenger.testFailed', { detail: '' }), { sticky: true }),
  });
}

/** Pull a channel now instead of waiting for the 15s poll. */
export function useSyncMessengerChannel() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => messengerService.sync(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: key(tenantKey) });
      if (result.error) {
        toast.error(t('messenger.syncFailed', { detail: result.error }), { sticky: true });
        return;
      }
      // "0 fetched" on a disabled channel is not "no messages" — it means
      // nothing will arrive on its own until the channel is enabled.
      if (result.inactive) {
        toast.error(t('messenger.syncInactive', { count: result.fetched }), { sticky: true });
        return;
      }
      toast.success(t('messenger.syncOk', { count: result.fetched }));
    },
    onError: (e: Error) => toast.error(e.message || t('messenger.syncFailed', { detail: '' }), { sticky: true }),
  });
}

export function useRegisterMessengerWebhook() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => messengerService.registerWebhook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(tenantKey) });
      toast.success(t('messenger.webhookRegistered'));
    },
    onError: (e: Error) =>
      toast.error(e.message || t('messenger.webhookRegisterError'), { sticky: true }),
  });
}
