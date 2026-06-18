import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getPrefs,
  listNotifications,
  markRead,
  setPref,
  unreadCount,
} from '../services/notificationService';
import type {
  NotifChannel,
  NotificationCategory,
} from '../lib/types';

export function useNotifications(
  sessionToken: string | null,
  category: NotificationCategory,
) {
  return useQuery({
    queryKey: ['notifications', sessionToken, category],
    queryFn: () => listNotifications(sessionToken!, category),
    enabled: !!sessionToken,
  });
}

export function useUnreadCount(sessionToken: string | null) {
  return useQuery({
    queryKey: ['unread-count', sessionToken],
    queryFn: () => unreadCount(sessionToken!),
    enabled: !!sessionToken,
    refetchInterval: 30_000,
  });
}

export function useMarkRead(sessionToken: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markRead(id, sessionToken!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}

export function usePrefs(sessionToken: string | null) {
  return useQuery({
    queryKey: ['prefs', sessionToken],
    queryFn: () => getPrefs(sessionToken!),
    enabled: !!sessionToken,
  });
}

export function useSetPref(sessionToken: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      channel: NotifChannel;
      category: NotificationCategory;
      enabled: boolean;
    }) => setPref(sessionToken!, p.channel, p.category, p.enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prefs'] });
    },
  });
}
