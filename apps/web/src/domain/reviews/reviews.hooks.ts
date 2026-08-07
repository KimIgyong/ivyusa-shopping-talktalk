import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reviewsService } from './reviews.service';
import type { ReviewListParams, ReviewStatus } from './reviews.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export const useReviews = (params: ReviewListParams) => {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['admin-reviews', tenantKey, params],
    queryFn: () => reviewsService.list(params),
    placeholderData: keepPreviousData,
  });
};

export function useSetReviewStatus() {
  const { t } = useTranslation('reviews');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) =>
      reviewsService.setStatus(id, status),
    onSuccess: (_data, { status }) => {
      qc.invalidateQueries({ queryKey: ['admin-reviews', tenantKey] });
      // Success auto-closes; errors stay until dismissed (dev-kit §4.3).
      toast.success(t(status === 'hidden' ? 'toastHidden' : 'toastUnhidden'));
    },
    onError: (e: Error) => {
      toast.error(e.message || t('toastError'), { sticky: true });
    },
  });
}
