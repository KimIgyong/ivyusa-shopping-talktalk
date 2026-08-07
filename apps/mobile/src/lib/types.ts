// API response shapes — mirrored from apps/widget/src/lib/types.ts (the widget
// and the app consume the same public endpoints; keep in sync).

export type SenderType = 'user' | 'ai' | 'agent' | 'system';
export type ConsentState = 'pending' | 'granted' | 'declined';

export interface SessionResponse {
  sessionToken: string;
  language: string;
  consentState: ConsentState | string;
  authenticated: boolean;
  privacyPolicyUrl?: string | null;
  consentNoticeVersion?: string;
  noticeOutdated?: boolean;
  consentAt?: string | null;
}

export interface ChatMessage {
  id: string;
  senderType: SenderType;
  senderName?: string | null;
  body: string;
  createdAt: string;
  pending?: boolean;
}

export interface Conversation {
  conversationId: string | null;
  status: string;
  messages: ChatMessage[];
}

export interface ChatReply {
  conversationId: string;
  reply: { senderType: SenderType; body: string } | null;
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

export interface ScenarioButton {
  id: string;
  label: string;
  action: string;
  enabled: boolean;
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

export interface OrderItemLine {
  id?: string;
  title: string;
  optionText?: string;
  qty: number;
  price: number;
}

export interface OrderDetail {
  order: OrderSummary & Record<string, unknown>;
  items: OrderItemLine[];
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

export type NotificationCategory = 'payment' | 'shipping' | 'event' | 'review' | 'chat' | string;

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  statusBadge?: string | null;
  channel: string;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface ProductSummary {
  handle: string;
  title: string;
  vendor: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  productUrl: string;
  category: string | null;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  tags: string[];
  publishedAt: string | null;
}

export type SaveList = 'wish' | 'later';

export interface SaveItem {
  id: string;
  list: SaveList;
  note: string | null;
  productHandle: string;
  createdAt: string;
  /** Catalog join — null when the product left the catalog. */
  product: ProductSummary | null;
}

export interface NudgeCreated {
  code: string;
  /** Public PWA card URL to put in the share sheet. */
  url: string;
}

export interface AffiliateStatus {
  status: string;
  linkCode: string | null;
}

export interface NotifPref {
  id: string;
  channel: string;
  category: NotificationCategory;
  enabled: boolean;
}
