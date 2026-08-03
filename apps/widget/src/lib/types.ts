export type SenderType = 'user' | 'ai' | 'agent' | 'system';

export type ConsentState = 'pending' | 'granted' | 'declined';

export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: ConsentState | string;
  authenticated: boolean;
  /** Tenant-configured privacy policy link (null when unset). */
  privacyPolicyUrl?: string | null;
  /** Version tag of the consent notice currently in force for this tenant. */
  consentNoticeVersion?: string;
  /** True when the stored consent predates the current notice version. */
  noticeOutdated?: boolean;
  /** When the current consent choice was recorded (null when pending). */
  consentAt?: string | null;
}

export interface ConsentResult {
  consentState: ConsentState | string;
  consentVersion: string;
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

/** Flat detail payload from GET /orders/:id (OrderMapper.toDetail) — order
 *  fields at the top level with `items` inline; there is no nested `order`. */
export interface OrderDetail extends OrderSummary {
  items: OrderItem[];
}

export interface TrackingStep {
  label: string;
  at?: string | null;
  done?: boolean;
}

export interface Tracking {
  status: string;
  carrier: string;
  trackingNumber: string;
  stepIndex: number;
  steps: TrackingStep[];
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

// 'push' = native mobile push (managed from the mobile app; not surfaced in the
// widget's preference panel — the widget cannot register device tokens).
export type NotifChannel = 'in_app' | 'email' | 'sms' | 'web_push' | 'push';

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
