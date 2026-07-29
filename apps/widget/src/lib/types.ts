export type SenderType = 'user' | 'ai' | 'agent' | 'system';

export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: 'granted' | 'denied' | 'unknown' | string;
  authenticated: boolean;
  /** Signed-in shopper's name, when the backend knows it — used to greet them. */
  customerName: string | null;
}

export interface ChatMessage {
  id: string;
  senderType: SenderType;
  /** For agent messages, the display name of the replying agent (FR-066). */
  senderName?: string | null;
  body: string;
  createdAt: string;
  citations?: Citation[];
  pending?: boolean;
  /** Scenario follow-up chips attached to a scripted reply (FR-S1). */
  quickReplies?: ScenarioFollowUp[];
}

export interface Citation {
  title?: string;
  url?: string;
}

export interface Conversation {
  /** Null until the first message creates a conversation (read-only poll). */
  conversationId: string | null;
  status: string;
  messages: ChatMessage[];
}

export interface ChatReply {
  conversationId: string;
  /** Null when the conversation is in agent mode (agent replies via polling). */
  reply: {
    senderType: SenderType;
    body: string;
    citations?: Citation[];
  } | null;
  escalate: boolean;
  needsAuth: boolean;
}

export interface ScenarioFollowUp {
  id: string;
  label: string;
}

export interface ScenarioReply {
  conversationId: string;
  reply: { senderType: SenderType; body: string };
  followUps: ScenarioFollowUp[];
}

/**
 * GET /orders item (backend OrderListItem). The status/total/currency really are
 * nullable on the wire — an order can be cached before Shopify reports them — so
 * they are typed that way here. Declaring them non-null hid the nullability from
 * every consumer instead of removing it.
 */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  statusInternal: string | null;
  statusUi: string | null;
  total: number | null;
  currency: string | null;
  itemCount: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  title: string;
  optionText: string | null;
  qty: number;
  price: number | null;
}

/**
 * POST /orders/guest-lookup returns the backend's much smaller `OrderSummary`
 * (4 fields) — NOT the list-item shape. It was typed as the full list item, which
 * promised `currency`, `createdAt` and `itemCount` that never arrive; nothing reads
 * the result today, so the lie was invisible.
 */
export interface OrderLookupResult {
  id: string;
  orderNumber: string;
  statusUi: string | null;
  total: number | null;
}

/**
 * GET /orders/:id — the order's own fields with its line items, FLAT (mirrors the
 * backend's OrderDetailView). It is deliberately not `{ order, items }`: this type
 * used to claim that shape, nothing validated it, and reading `data.order.statusUi`
 * threw at runtime — which unmounted the whole widget, bubble included.
 */
export interface OrderDetail {
  id: string;
  orderNumber: string;
  statusInternal: string | null;
  statusUi: string | null;
  total: number | null;
  currency: string | null;
  createdAt: string;
  items: OrderItem[];
}

/**
 * GET /orders/:id/tracking. `steps` is a list of localized LABELS (the backend
 * sends `deliverySteps(session.language)`), and how far along we are comes from
 * `stepIndex` — there is no per-step object. This used to be typed as
 * `{label, at, done}[]`, which silently rendered blank labels, and `step.at` hit
 * `String.prototype.at` — a function — which React then refused to render.
 */
export interface Tracking {
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  stepIndex: number;
  steps: string[];
}

export type NotificationCategory =
  | 'payment'
  | 'shipping'
  | 'event'
  | 'review'
  | string;

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  /** Nullable on the wire (notification.entity `body` is nullable). */
  body: string | null;
  statusBadge?: string | null;
  /** Delivery channel the row was created for (in_app/email/sms/web_push). */
  channel?: string;
  /** Server-derived `readAt != null`; the UI keys off readAt directly. */
  read?: boolean;
  readAt?: string | null;
  createdAt: string;
}

export type NotifChannel = 'in_app' | 'email' | 'sms' | 'web_push';

export interface NotifPref {
  channel: NotifChannel;
  category: NotificationCategory;
  enabled: boolean;
}

/**
 * GET /affiliate/status. Note `'none'` never comes from the server — with no
 * affiliate row the endpoint 404s, and the caller falls back to 'none'.
 */
export interface AffiliateStatus {
  status: 'pending' | 'approved' | 'rejected' | string;
  linkCode?: string | null;
  commissionRate?: number;
}

/** Server-driven scenario action keys (admin-configured). */
export type ScenarioActionKey =
  | 'delivery_status'
  | 'cancel_refund'
  | 'product_help'
  | 'contact_support'
  | 'affiliate'
  | 'my_orders'
  | 'message';

export interface ScenarioButton {
  id: string;
  label: string;
  action: ScenarioActionKey | string;
  enabled: boolean;
}
