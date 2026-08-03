/**
 * GA4 event vocabulary + conversion funnel for the support widget.
 *
 * Names follow GA4 conventions: recommended events (`purchase`, `begin_checkout`,
 * `view_item`, `search`) keep their reserved names so GA4's built-in reports and
 * conversion tooling light up; widget-specific interactions use a `widget_`/
 * `chat_` prefix. `PURCHASE` is the payment-conversion key event.
 */
export const GA_EVENT = {
  // Funnel-stage marker (mirrors the backend CJM stages) — one event, `stage` param.
  FUNNEL_STAGE: 'funnel_stage',

  // Widget lifecycle
  WIDGET_VIEW: 'widget_view', // widget mounted / impression on the page
  WIDGET_OPEN: 'widget_open', // panel opened (engagement)
  WIDGET_CLOSE: 'widget_close',
  TAB_VIEW: 'widget_tab_view', // notifications / chat / orders tab shown

  // Chat / support
  CHAT_START: 'chat_start', // first message of a conversation
  MESSAGE_SENT: 'chat_message_sent',
  SCENARIO_CLICK: 'chat_scenario_click', // scenario button / quick reply
  ESCALATE: 'chat_escalate', // requested a human agent

  // Consideration → intent (order-related, GA4 recommended where possible)
  SEARCH: 'search', // guest order lookup
  VIEW_ITEM: 'view_item', // opened an order detail
  TRACKING_VIEW: 'order_tracking_view',
  BEGIN_CHECKOUT: 'begin_checkout', // clicked through to checkout / re-purchase CTA

  // Conversion (payment)
  PURCHASE: 'purchase',
} as const;

export type GaEventName = (typeof GA_EVENT)[keyof typeof GA_EVENT];

/**
 * Conversion funnel stages, aligned with the backend CJM (Customer Journey Map).
 * Emitted via GA_EVENT.FUNNEL_STAGE so the whole journey is one analyzable
 * sequence: impression → open → chat → order interest → checkout → purchase.
 */
export const FUNNEL_STAGE = {
  AWARENESS: 'awareness', // widget impression
  ENGAGEMENT: 'engagement', // panel opened
  CONSIDERATION: 'consideration', // chatting / browsing orders
  INTENT: 'intent', // begin checkout / re-order
  PURCHASE: 'purchase', // payment completed
} as const;

export type FunnelStage = (typeof FUNNEL_STAGE)[keyof typeof FUNNEL_STAGE];

/** A single line item for a purchase/checkout event (GA4 `items` shape). */
export interface GaItem {
  item_id?: string;
  item_name?: string;
  quantity?: number;
  price?: number;
}

/** Payload for the payment-conversion event (GA4 recommended `purchase`). */
export interface PurchasePayload {
  transaction_id: string;
  value: number;
  currency: string;
  items?: GaItem[];
}
