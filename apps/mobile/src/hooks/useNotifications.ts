import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { listNotifications, markRead, unreadCount } from '../services/notificationService';
import { useSession } from '../store/session-context';
import { ApiError } from '../lib/api-client';

/**
 * Unread badge count, polled every 30s (parity with widget useNotifications).
 * 401 (anonymous session — no bound customer yet) reads as 0, not an error.
 * Also mirrors the count onto the app icon badge.
 */
export function useUnreadBadge(): number {
  const { token } = useSession();
  const query = useQuery({
    queryKey: ['unread', token],
    enabled: !!token,
    refetchInterval: 30_000,
    queryFn: async () => {
      try {
        return (await unreadCount(token!)).count;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return 0;
        throw e;
      }
    },
  });
  const count = query.data ?? 0;
  useEffect(() => {
    void Notifications.setBadgeCountAsync(count).catch(() => undefined);
  }, [count]);
  return count;
}

/** In-app notification center list. Push/email rows are delivery records — hide them. */
export function useNotificationList() {
  const { token } = useSession();
  return useQuery({
    queryKey: ['notifications', token],
    enabled: !!token,
    queryFn: async () => {
      try {
        const items = await listNotifications(token!);
        return items.filter((n) => n.channel === 'in_app');
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return [];
        throw e;
      }
    },
  });
}

export function useMarkRead() {
  const { token } = useSession();
  const qc = useQueryClient();
  return async (id: string) => {
    if (!token) return;
    await markRead(id, token);
    await qc.invalidateQueries({ queryKey: ['notifications', token] });
    await qc.invalidateQueries({ queryKey: ['unread', token] });
  };
}
