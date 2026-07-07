export type SenderType = 'user' | 'ai' | 'agent' | 'system';

export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: 'granted' | 'denied' | 'unknown' | string;
  authenticated: boolean;
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
  conversationId: string;
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

export interface OrderDetail {
  order: OrderSummary & Record<string, unknown>;
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
