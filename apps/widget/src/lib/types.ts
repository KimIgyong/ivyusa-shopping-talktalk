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

export interface OrderSummary {
  id: string;
  orderNumber: string;
  statusUi: string;
  total: number;
  currency: string;
  itemCount: number;
  createdAt: string;
}

export interface OrderItem {
  id?: string;
  title: string;
  optionText?: string;
  qty: number;
  price: number;
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
  body: string;
  statusBadge?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export type NotifChannel = 'in_app' | 'email' | 'sms' | 'web_push';

export interface NotifPref {
  channel: NotifChannel;
  category: NotificationCategory;
  enabled: boolean;
}

export interface AffiliateStatus {
  status: 'none' | 'pending' | 'approved' | 'rejected' | string;
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
