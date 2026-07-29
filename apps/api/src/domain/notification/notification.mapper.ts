import type {
  NotificationPrefResponse,
  NotificationResponse,
} from '@ivy/types';
import { Notification } from './entity/notification.entity';
import { NotificationPref } from './entity/notification-pref.entity';

/** Map a notification row to the camelCase response shape (read flag derived). */
export function toNotificationResponse(n: Notification): NotificationResponse {
  return {
    id: String(n.id),
    category: n.category,
    title: n.title,
    body: n.body,
    statusBadge: n.statusBadge,
    channel: n.channel,
    read: n.readAt != null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Map a preference row to a camelCase response shape. */
export function toPrefResponse(p: NotificationPref): NotificationPrefResponse {
  return {
    id: String(p.id),
    channel: p.channel,
    category: p.category,
    enabled: p.enabled === 1,
  };
}
