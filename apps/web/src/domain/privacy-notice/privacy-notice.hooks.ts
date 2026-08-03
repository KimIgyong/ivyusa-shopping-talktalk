import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { privacyNoticeService } from './privacy-notice.service';
import type { UpdatePrivacyNoticeBody } from './privacy-notice.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const usePrivacyNotice = () => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['privacy-notice', tenantKey],
    queryFn: () => privacyNoticeService.get(),
  });
};

export function useUpdatePrivacyNotice() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: UpdatePrivacyNoticeBody) => privacyNoticeService.update(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['privacy-notice', tenantKey] });
      // Success auto-closes; errors stay until dismissed (dev-kit §4.3).
      toast.success(t('privacyNotice.saved'));
    },
    onError: (e: Error) => {
      toast.error(e.message || t('privacyNotice.saveError'), { sticky: true });
    },
  });
}
