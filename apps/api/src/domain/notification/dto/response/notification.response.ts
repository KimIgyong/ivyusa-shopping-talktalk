/** Input accepted by NotificationService.notify and the EVENTS.NOTIFICATION handler. */
export interface NotifyInput {
  customerId?: number | null;
  sessionId?: number | null;
  category: string;
  title: string;
  body?: string | null;
  statusBadge?: string | null;
  channel?: string | null;
}
