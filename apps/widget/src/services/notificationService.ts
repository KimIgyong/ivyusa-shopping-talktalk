import { apiClient } from '../lib/api-client';
import type {
  NotifChannel,
  NotificationCategory,
  NotificationItem,
  NotifPref,
} from '../lib/types';

export function listNotifications(
  sessionToken: string,
  category?: NotificationCategory,
): Promise<NotificationItem[]> {
  return apiClient.get<NotificationItem[]>('/notifications', {
    session_token: sessionToken,
    category: category && category !== 'all' ? category : undefined,
  });
}

export function markRead(
  id: string,
  sessionToken: string,
): Promise<unknown> {
  return apiClient.post(`/notifications/${id}/read`, {
    session_token: sessionToken,
  });
}

export function unreadCount(sessionToken: string): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>('/notifications/unread-count', {
    session_token: sessionToken,
  });
}

export function getPrefs(sessionToken: string): Promise<NotifPref[]> {
  return apiClient.get<NotifPref[]>('/notifications/prefs', {
    session_token: sessionToken,
  });
}

export function setPref(
  sessionToken: string,
  channel: NotifChannel,
  category: NotificationCategory,
  enabled: boolean,
): Promise<unknown> {
  return apiClient.put('/notifications/prefs', {
    session_token: sessionToken,
    channel,
    category,
    enabled,
  });
}
