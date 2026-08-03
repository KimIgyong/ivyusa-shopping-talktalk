import { apiClient } from '../lib/api-client';
import type { NotifPref, NotificationCategory, NotificationItem } from '../lib/types';

export function listNotifications(
  sessionToken: string,
  category?: NotificationCategory,
): Promise<NotificationItem[]> {
  return apiClient.get<NotificationItem[]>('/notifications', sessionToken, {
    category: category && category !== 'all' ? category : undefined,
  });
}

export function markRead(id: string, sessionToken: string): Promise<unknown> {
  return apiClient.post(`/notifications/${id}/read`, { session_token: sessionToken });
}

export function unreadCount(sessionToken: string): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>('/notifications/unread-count', sessionToken);
}

export function getPrefs(sessionToken: string): Promise<NotifPref[]> {
  return apiClient.get<NotifPref[]>('/notifications/prefs', sessionToken);
}

export function setPref(
  sessionToken: string,
  channel: string,
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
