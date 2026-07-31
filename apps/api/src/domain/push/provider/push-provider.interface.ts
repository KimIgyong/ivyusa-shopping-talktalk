/** One outbound push message, provider-agnostic. */
export interface PushMessage {
  /** Provider device token (e.g. ExponentPushToken[...]). */
  to: string;
  title: string;
  body?: string | null;
  /** Deep-link payload delivered to the app (category, notificationId, ...). */
  data?: Record<string, unknown>;
  badge?: number;
}

/** Immediate per-message send outcome (provider "ticket"). */
export interface PushTicket {
  token: string;
  ok: boolean;
  /** Token is permanently dead (DeviceNotRegistered) — revoke it. */
  shouldRevoke: boolean;
  /** Provider receipt id for the deferred delivery check (ok tickets only). */
  receiptId?: string;
  error?: string;
}

/** Deferred delivery outcome for a previously returned receipt id. */
export interface PushReceipt {
  receiptId: string;
  ok: boolean;
  shouldRevoke: boolean;
  error?: string;
}

/**
 * Push delivery abstraction (PLN-MobileApp D-2). Default implementation is the
 * Expo Push Service; a direct FCM v1 provider can replace it without touching
 * dispatch logic. Implementations must never throw on delivery failure —
 * failures come back as tickets (the in-app notification row is the fallback).
 */
export interface PushProvider {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  getReceipts(receiptIds: string[]): Promise<PushReceipt[]>;
}

export const PUSH_PROVIDER = 'PUSH_PROVIDER';
