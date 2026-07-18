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
  PAID: 'paid',
  PREPARING: 'preparing',
  SHIPPING: 'shipping',
  DELIVERED: 'delivered',
} as const;
export type OrderStatusInternal = (typeof ORDER_STATUS_INTERNAL)[keyof typeof ORDER_STATUS_INTERNAL];

export const ORDER_STATUS_UI = {
  CONFIRMED: 'Confirmed',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  REVIEW: 'Review',
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
  ALL: 'all',
} as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
  WEB_PUSH: 'web_push',
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
export const INTEGRATION_FIELDS: Record<EcommerceProvider, IntegrationFieldSpec[]> = {
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
};
