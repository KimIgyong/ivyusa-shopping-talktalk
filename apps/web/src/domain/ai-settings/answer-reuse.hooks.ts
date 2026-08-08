import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { answerReuseService } from './answer-reuse.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

const KEY = 'answer-reuse';

export function useAnswerReuseList(page: number, q: string, activeOnly: boolean) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: [KEY, tenantKey, page, q, activeOnly],
    queryFn: () => answerReuseService.list(page, 10, q || undefined, activeOnly),
  });
}

/** Save/toggle/delete — success toasts auto-close, errors stay (dev-kit §4.3). */
export function useAnswerReuseMutations() {
  const { t } = useTranslation('aiSetting');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const invalidate = () => qc.invalidateQueries({ queryKey: [KEY, tenantKey] });

  const update = useMutation({
    mutationFn: (v: { id: string; answerText?: string; active?: boolean }) =>
      answerReuseService.update(v.id, v),
    onSuccess: () => {
      invalidate();
      toast.success(t('answerReuse.saved'));
    },
    onError: (e: Error) => toast.error(e.message || t('answerReuse.saveError'), { sticky: true }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => answerReuseService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('answerReuse.deleted'));
    },
    onError: (e: Error) => toast.error(e.message || t('answerReuse.saveError'), { sticky: true }),
  });

  const deactivateAll = useMutation({
    mutationFn: () => answerReuseService.deactivateAll(),
    onSuccess: (res) => {
      invalidate();
      toast.success(t('answerReuse.deactivatedAll', { count: res.deactivated }));
    },
    onError: (e: Error) => toast.error(e.message || t('answerReuse.saveError'), { sticky: true }),
  });

  return { update, remove, deactivateAll };
}
