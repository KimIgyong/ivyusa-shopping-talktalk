// Shared domain enums & constant objects (frontend + backend).
// Pattern: const object + derived union type (amoeba_code_convention_v2).

// ---- Tenancy & RBAC ----
export const ADMIN_LEVEL = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin' } as const;
export type AdminLevel = (typeof ADMIN_LEVEL)[keyof typeof ADMIN_LEVEL];

export const USER_RANK = {
  MASTER: 'master',
  DIRECTOR: 'director',
  MANAGER: 'manager',
  STAFF: 'staff',
} as const;
export type UserRank = (typeof USER_RANK)[keyof typeof USER_RANK];

export const JOB_LABEL = {
  CONSULT: 'consult',
  ACCOUNTING: 'accounting',
  OPERATIONS: 'operations',
} as const;
export type JobLabel = (typeof JOB_LABEL)[keyof typeof JOB_LABEL];

export const ACTOR_TYPE = { ADMIN: 'admin', USER: 'user' } as const;
export type ActorType = (typeof ACTOR_TYPE)[keyof typeof ACTOR_TYPE];

// ---- Customer ----
export const CUSTOMER_TIER = { GUEST: 'guest', SUBSCRIBER: 'subscriber', REGULAR: 'regular' } as const;
export type CustomerTier = (typeof CUSTOMER_TIER)[keyof typeof CUSTOMER_TIER];

export const CONSENT_STATE = { PENDING: 'pending', GRANTED: 'granted', DECLINED: 'declined' } as const;
export type ConsentState = (typeof CONSENT_STATE)[keyof typeof CONSENT_STATE];

// How the widget's "Sign in" opens the storefront login (tenant console
// setting). REDIRECT navigates the whole tab (default — survives popup
// blockers and Shopify's hosted New Customer Accounts login); POPUP keeps the
// store page and brokers a popup window.
export const WIDGET_LOGIN_MODE = { REDIRECT: 'redirect', POPUP: 'popup' } as const;
export type WidgetLoginMode = (typeof WIDGET_LOGIN_MODE)[keyof typeof WIDGET_LOGIN_MODE];

// Session identity assurance. VERIFIED is minted only via the Shopify App Proxy
// (Shopify-signed customer identity); GUEST covers order-number+email lookup.
export const SESSION_IDENTITY = { GUEST: 'guest', VERIFIED: 'verified' } as const;
export type SessionIdentity = (typeof SESSION_IDENTITY)[keyof typeof SESSION_IDENTITY];

export const SESSION_LANGUAGE = { EN: 'EN', ES: 'ES', KO: 'KO' } as const;
export type SessionLanguage = (typeof SESSION_LANGUAGE)[keyof typeof SESSION_LANGUAGE];

// ---- Chat ----
export const CONVERSATION_STATUS = {
  AI_ACTIVE: 'ai_active',
  WAITING: 'waiting',
  AGENT: 'agent',
  ENDED: 'ended',
} as const;
export type ConversationStatus = (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];

export const SENDER_TYPE = { USER: 'user', AI: 'ai', AGENT: 'agent', SYSTEM: 'system' } as const;
export type SenderType = (typeof SENDER_TYPE)[keyof typeof SENDER_TYPE];

// ---- Orders (POL-014 taxonomy) ----
export const ORDER_STATUS_INTERNAL = {
  // Cafe24 N00(입금전) — the shopper hasn't paid yet. Shopify orders never carry
  // this (they enter the cache already paid); it only appears on channels that
  // expose a pre-payment stage (PLN-260807 §3.3).
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  PREPARING: 'preparing',
  SHIPPING: 'shipping',
  DELIVERED: 'delivered',
  // Cafe24 C00(취소신청) — a cancel was requested; off the main fulfilment flow.
  CANCEL_REQUESTED: 'cancel_requested',
} as const;
export type OrderStatusInternal = (typeof ORDER_STATUS_INTERNAL)[keyof typeof ORDER_STATUS_INTERNAL];

export const ORDER_STATUS_UI = {
  PENDING_PAYMENT: 'Pending payment',
  CONFIRMED: 'Confirmed',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  REVIEW: 'Review',
  CANCEL_REQUESTED: 'Cancel requested',
} as const;
export type OrderStatusUi = (typeof ORDER_STATUS_UI)[keyof typeof ORDER_STATUS_UI];

export const FULFILLMENT_STATUS = {
  PREPARING: 'preparing',
  SHIPPED: 'shipped',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
} as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[keyof typeof FULFILLMENT_STATUS];

// ---- Notifications ----
export const NOTIFICATION_CATEGORY = {
  PAYMENT: 'payment',
  SHIPPING: 'shipping',
  EVENT: 'event',
  REVIEW: 'review',
  // Agent chat replies delivered while the mobile app is backgrounded.
  // Transactional (service) category — default-allow like payment/shipping.
  CHAT: 'chat',
  ALL: 'all',
} as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
  WEB_PUSH: 'web_push',
  // Native mobile push (FCM/APNs via the provider abstraction in domain/push).
  PUSH: 'push',
} as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

// ---- CJM ----
export const CJM_STAGE = {
  AWARENESS: 'Awareness',
  BROWSE: 'Browse',
  INQUIRY: 'Inquiry',
  PURCHASE: 'Purchase',
  DELIVERY: 'Delivery',
  POST: 'Post',
} as const;
export type CjmStage = (typeof CJM_STAGE)[keyof typeof CJM_STAGE];

// ---- AI engine / functions ----
export const AI_FUNCTION = {
  CHAT: 'chat',
  RAG: 'rag',
  SUMMARY: 'summary',
  ASSIST: 'assist',
  MODERATION: 'moderation',
  EMBEDDING: 'embedding',
  /**
   * Admin-facing coaching chat (FR-071). Routed separately from CHAT/RAG so a
   * tenant can give the channel that writes durable config its own engine.
   */
  COACH: 'coach',
} as const;
export type AiFunction = (typeof AI_FUNCTION)[keyof typeof AI_FUNCTION];

export const AI_PROVIDER = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  AZURE: 'azure',
  CUSTOM: 'custom',
} as const;
export type AiProvider = (typeof AI_PROVIDER)[keyof typeof AI_PROVIDER];

// ---- Moderation ----
export const MODERATION_ACTION = {
  BLOCK: 'block',
  MASK: 'mask',
  WARN: 'warn',
  REPHRASE: 'rephrase',
  PASS: 'pass',
} as const;
export type ModerationAction = (typeof MODERATION_ACTION)[keyof typeof MODERATION_ACTION];

export const MODERATION_DECISION = {
  BLOCKED: 'blocked',
  DELIVERED: 'delivered',
  EDITED: 'edited',
} as const;
export type ModerationDecision = (typeof MODERATION_DECISION)[keyof typeof MODERATION_DECISION];

// ---- Knowledge sources ----
export const KNOWLEDGE_SOURCE_TYPE = { BOARD: 'board', REPOSITORY: 'repository', GDRIVE: 'gdrive' } as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPE)[keyof typeof KNOWLEDGE_SOURCE_TYPE];

// ---- Integrations ----
export const INTEGRATION_PROVIDER = {
  SHOPIFY: 'shopify',
  CAFE24: 'cafe24',
  WOOCOMMERCE: 'woocommerce',
  ODOO: 'odoo',
  HARAVAN: 'haravan',
  FULFILLMENT: 'fulfillment',
  KLAVIYO: 'klaviyo',
  YOTPO: 'yotpo',
  GORGIAS: 'gorgias',
  GOOGLE_DRIVE: 'google_drive',
} as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDER)[keyof typeof INTEGRATION_PROVIDER];

/**
 * E-commerce providers that expose a per-tenant "connection settings" card in the
 * console (credentials + connection test). Shopify keeps its own richer card
 * (install guide, order sync, webhooks); these four use the generic flow.
 */
export const ECOMMERCE_PROVIDERS = [
  INTEGRATION_PROVIDER.CAFE24,
  INTEGRATION_PROVIDER.WOOCOMMERCE,
  INTEGRATION_PROVIDER.ODOO,
  INTEGRATION_PROVIDER.HARAVAN,
] as const;
export type EcommerceProvider = (typeof ECOMMERCE_PROVIDERS)[number];

/**
 * Non-commerce connected apps sharing the SAME generic credential flow
 * (PLN-260808-Marketing-Integrations): marketing platforms and helpdesks.
 * Kept as separate axes so the console can group tiles and P2 can add more
 * helpdesk connectors (Zendesk/Front/Freshdesk) without touching commerce.
 */
export const MARKETING_PROVIDERS = [
  INTEGRATION_PROVIDER.KLAVIYO,
  INTEGRATION_PROVIDER.YOTPO,
] as const;
export type MarketingProvider = (typeof MARKETING_PROVIDERS)[number];

export const HELPDESK_PROVIDERS = [INTEGRATION_PROVIDER.GORGIAS] as const;
export type HelpdeskProvider = (typeof HELPDESK_PROVIDERS)[number];

/** Every provider served by the generic settings/save/test flow. */
export const GENERIC_INTEGRATION_PROVIDERS = [
  ...ECOMMERCE_PROVIDERS,
  ...MARKETING_PROVIDERS,
  ...HELPDESK_PROVIDERS,
] as const;
export type GenericIntegrationProvider = (typeof GENERIC_INTEGRATION_PROVIDERS)[number];

/** One credential field of an integration. `secret` fields are write-only (masked on read). */
export interface IntegrationFieldSpec {
  key: string;
  secret: boolean;
  required: boolean;
}

/**
 * Credential field schema per e-commerce provider — single source of truth shared
 * by the API (which fields to store/mask/validate) and the console (which inputs to
 * render). Field labels/placeholders are localized on the client by field `key`.
 */
// `webhook_secret` (optional, per-tenant) is the HMAC/shared secret used to verify
// this provider's inbound webhooks. Stored encrypted alongside the other creds so a
// tenant can manage it from the console; the API falls back to a global env secret
// when it is unset. (Shopify is intentionally NOT here — its webhook secret is the
// app-level API secret shared across all shops, sourced from env.)
export const INTEGRATION_FIELDS: Record<GenericIntegrationProvider, IntegrationFieldSpec[]> = {
  cafe24: [
    { key: 'mall_id', secret: false, required: true },
    { key: 'client_id', secret: true, required: false },
    { key: 'client_secret', secret: true, required: false },
    { key: 'access_token', secret: true, required: true },
    { key: 'webhook_secret', secret: true, required: false },
  ],
  woocommerce: [
    { key: 'store_url', secret: false, required: true },
    { key: 'consumer_key', secret: true, required: true },
    { key: 'consumer_secret', secret: true, required: true },
    { key: 'webhook_secret', secret: true, required: false },
  ],
  odoo: [
    { key: 'url', secret: false, required: true },
    { key: 'db', secret: false, required: true },
    { key: 'username', secret: false, required: true },
    { key: 'api_key', secret: true, required: true },
    { key: 'webhook_secret', secret: true, required: false },
  ],
  haravan: [
    { key: 'shop_domain', secret: false, required: true },
    { key: 'access_token', secret: true, required: true },
    { key: 'webhook_secret', secret: true, required: false },
  ],
  // Marketing (PLN-260808): Klaviyo private API key; Yotpo core API app/secret pair.
  klaviyo: [{ key: 'api_key', secret: true, required: true }],
  yotpo: [
    { key: 'app_key', secret: false, required: true },
    { key: 'secret_key', secret: true, required: true },
  ],
  // Helpdesk (Rev.2, pre-provisions the P2 Gorgias L1 connector): REST Basic auth
  // = account email + REST API key on the account subdomain (REQ-260807 §11.2.1).
  gorgias: [
    { key: 'subdomain', secret: false, required: true },
    { key: 'email', secret: false, required: true },
    { key: 'api_key', secret: true, required: true },
    // L2 status webhook auth token (POST /webhooks/gorgias) — optional until the
    // tenant wires the Gorgias HTTP Integration (PLN-260809 P3).
    { key: 'webhook_secret', secret: true, required: false },
  ],
};

/**
 * External messenger channels (PLN-260810). Distinct from INTEGRATION_PROVIDER:
 * these carry *conversations* (inbound messages become ShopTalk conversations and
 * outbound replies go back out), not store/marketing credentials.
 */
export const MESSENGER_PROVIDER = {
  TELEGRAM: 'telegram',
  VIBER: 'viber',
  AMOEBATALK: 'amoebatalk',
  BTBZ_RELAY: 'btbz_relay',
  GMAIL: 'gmail',
} as const;
export type MessengerProvider = (typeof MESSENGER_PROVIDER)[keyof typeof MESSENGER_PROVIDER];

/** Channels ShopTalk speaks to directly (own webhook + own send API) — PR-M1. */
export const DIRECT_MESSENGER_PROVIDERS = [
  MESSENGER_PROVIDER.TELEGRAM,
  MESSENGER_PROVIDER.VIBER,
] as const;

/** How a channel is reached: 'direct' = platform API, 'hub' = via an aggregator. */
export const MESSENGER_MODE = { DIRECT: 'direct', HUB: 'hub' } as const;
export type MessengerMode = (typeof MESSENGER_MODE)[keyof typeof MESSENGER_MODE];

/**
 * Consent handling for a channel with no widget consent banner (REQ G3):
 * 'notice' sends the privacy notice on first contact and records the grant;
 * 'auto' relies on the platform's own terms (tenant's call).
 */
export const MESSENGER_CONSENT_MODE = { NOTICE: 'notice', AUTO: 'auto' } as const;
export type MessengerConsentMode =
  (typeof MESSENGER_CONSENT_MODE)[keyof typeof MESSENGER_CONSENT_MODE];

/**
 * Outbound delivery state. 'unconfirmed' exists because some relays (btbz KSR)
 * cannot prove delivery — reporting those as 'sent' would be a false claim.
 */
export const OUTBOX_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  UNCONFIRMED: 'unconfirmed',
  FAILED: 'failed',
} as const;
export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];

export const CHANNEL_DIRECTION = { INBOUND: 'inbound', OUTBOUND: 'outbound' } as const;
export type ChannelDirection = (typeof CHANNEL_DIRECTION)[keyof typeof CHANNEL_DIRECTION];

/** Credential fields per messenger provider (console renders, API stores/masks). */
export const MESSENGER_FIELDS: Record<MessengerProvider, IntegrationFieldSpec[]> = {
  // Bot token from BotFather — the only credential Telegram needs.
  telegram: [{ key: 'bot_token', secret: true, required: true }],
  // Viber public-account auth token; also the HMAC key for inbound signatures.
  viber: [{ key: 'auth_token', secret: true, required: true }],
  amoebatalk: [
    { key: 'email', secret: false, required: true },
    { key: 'password', secret: true, required: true },
    { key: 'company_id', secret: false, required: false },
  ],
  btbz_relay: [
    { key: 'base_url', secret: false, required: true },
    // Operator account — still what sends replies (the provider surface has no
    // write route yet; PLN-260814 D1a hybrid).
    { key: 'email', secret: false, required: true },
    { key: 'password', secret: true, required: true },
    // Provider API key (PLN-260814): when key_id + api_secret are both set the
    // adapter reads via the signed provider API instead of the operator inbox.
    { key: 'key_id', secret: false, required: false },
    { key: 'api_secret', secret: true, required: false },
    // Optional binding assertion: the relay rejects the call (E5101) when the
    // instance does not serve this customerRef — a mispointed base_url is
    // detected before any data is stored.
    { key: 'expected_customer', secret: false, required: false },
  ],
  gmail: [
    { key: 'email', secret: false, required: true },
    { key: 'imap_host', secret: false, required: true },
    { key: 'smtp_host', secret: false, required: true },
    { key: 'app_password', secret: true, required: true },
  ],
};
