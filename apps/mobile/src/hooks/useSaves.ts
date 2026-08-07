import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listSaves, removeSave } from '../services/saveService';
import { useSession } from '../store/session-context';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api-client';
import type { SaveItem, SaveList } from '../lib/types';

export interface SavesData {
  /** false = anonymous session (401 from /saves) — show the sign-in hint. */
  bound: boolean;
  items: SaveItem[];
}

/** Both save lists in one query — shared by product detail and the 마이 tab. */
export function useSaves(): UseQueryResult<SavesData> {
  const { token } = useSession();
  return useQuery<SavesData>({
    queryKey: ['saves', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        const [wish, later] = await Promise.all([
          listSaves(token!, 'wish'),
          listSaves(token!, 'later'),
        ]);
        return { bound: true, items: [...wish, ...later] };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return { bound: false, items: [] };
        throw e;
      }
    },
  });
}

/** Remove a saved item with the standard toast feedback + cache refresh. */
export function useRemoveSave() {
  const { t } = useTranslation();
  const { token } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  return async (productHandle: string, list: SaveList) => {
    if (!token) return;
    try {
      await removeSave(token, productHandle, list);
      toast.show(t('save.removed'));
      await qc.invalidateQueries({ queryKey: ['saves', token] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast.show(t('save.needLogin'), 'error');
      else toast.show(t('save.failed'), 'error');
    }
  };
}
