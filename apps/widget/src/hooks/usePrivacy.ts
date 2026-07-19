import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOptOutStatus, setOptOut } from '../services/privacyService';

export function useOptOutStatus(sessionToken: string | null) {
  return useQuery({
    queryKey: ['opt-out', sessionToken],
    queryFn: () => getOptOutStatus(sessionToken!),
    enabled: !!sessionToken,
  });
}

export function useSetOptOut(sessionToken: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (optOut: boolean) => setOptOut(sessionToken!, optOut),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opt-out'] });
      // Opt-out rewrites the external-channel preference rows — refresh the grid.
      qc.invalidateQueries({ queryKey: ['prefs'] });
    },
  });
}
