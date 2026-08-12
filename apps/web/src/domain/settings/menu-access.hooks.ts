import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { menuAccessService, type MenuAccessMode } from './menu-access.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export function useRoleMatrix(enabled = true) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['menu-access', tenantKey, 'roles'],
    queryFn: () => menuAccessService.roles(),
    enabled,
  });
}

export function useUserOverrides(enabled = true) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['menu-access', tenantKey, 'users'],
    queryFn: () => menuAccessService.users(),
    enabled,
  });
}

/**
 * Both mutations invalidate the `['menu-access', tenantKey]` prefix, which
 * deliberately also covers `useMenuAccess`'s own effective-menu query: the
 * editor should see the sidebar reflect what they just saved, not the answer
 * cached before it.
 */
export function useSaveRoleMatrix() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (roles: { rank: string; menuCode: string; allowed: boolean }[]) =>
      menuAccessService.saveRoles(roles),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-access', tenantKey] });
      // Success auto-closes; errors stay until dismissed (dev-kit §4.3).
      toast.success(t('menuAccess.saved'));
    },
    onError: (e: Error) => toast.error(e.message || t('menuAccess.saveError'), { sticky: true }),
  });
}

export function useSaveUserOverrides() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (v: { userId: string; menus: { code: string; mode: MenuAccessMode }[] }) =>
      menuAccessService.saveUser(v.userId, v.menus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-access', tenantKey] });
      toast.success(t('menuAccess.saved'));
    },
    onError: (e: Error) => toast.error(e.message || t('menuAccess.saveError'), { sticky: true }),
  });
}
