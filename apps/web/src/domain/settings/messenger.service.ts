import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';

/**
 * Messenger channel registry — mirror of the API's MESSENGER_FIELDS.
 *
 * Same rule as `integration-providers.ts`: the web app does not depend on
 * `@ivy/types` (CJS, and not in apps/web/package.json), so the shape is
 * re-declared here. KEEP IN SYNC with packages/types/src/common/enum.types.ts.
 */
export const MESSENGER_PROVIDERS = [
  'telegram',
  'viber',
  'amoebatalk',
  'btbz_relay',
] as const;
export type MessengerProvider = (typeof MESSENGER_PROVIDERS)[number];

/** Shown under "커뮤니케이션 연동" instead of the messenger group. */
export const COMMUNICATION_PROVIDERS = ['gmail'] as const;
export type CommunicationProvider = (typeof COMMUNICATION_PROVIDERS)[number];

export type AnyMessengerProvider = MessengerProvider | CommunicationProvider;

/** Providers the requirement lists that no adapter serves yet (card shows why). */
export const PLANNED_MESSENGER_PROVIDERS = ['zalo', 'line', 'whatsapp'] as const;

export interface MessengerFieldSpec {
  key: string;
  secret: boolean;
  required: boolean;
}

export const MESSENGER_FIELDS: Record<AnyMessengerProvider, MessengerFieldSpec[]> = {
  telegram: [{ key: 'bot_token', secret: true, required: true }],
  viber: [{ key: 'auth_token', secret: true, required: true }],
  amoebatalk: [
    { key: 'email', secret: false, required: true },
    { key: 'password', secret: true, required: true },
    { key: 'company_id', secret: false, required: false },
  ],
  btbz_relay: [
    { key: 'base_url', secret: false, required: true },
    { key: 'email', secret: false, required: true },
    { key: 'password', secret: true, required: true },
  ],
  gmail: [
    { key: 'email', secret: false, required: true },
    { key: 'imap_host', secret: false, required: true },
    { key: 'smtp_host', secret: false, required: true },
    { key: 'app_password', secret: true, required: true },
  ],
};

/** Channels whose traffic is captured outside an official platform API. */
export const UNOFFICIAL_PROVIDERS = new Set<string>(['btbz_relay']);

export interface MessengerChannel {
  id: string;
  provider: string;
  mode: 'direct' | 'hub' | string;
  label: string;
  accountId?: string | null;
  /** Whether a credential is stored — the secret itself is never returned. */
  credentialSet: boolean;
  config: Record<string, unknown>;
  autoReply: boolean;
  /** off | approve | auto — the channel default for new messages. */
  replyMode?: string;
  consentMode: 'notice' | 'auto' | string;
  active: boolean;
  status: 'connected' | 'error' | 'unknown' | string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  /** Receive URL for webhook channels; null for polled ones. */
  webhookUrl?: string | null;
  updatedAt?: string;
}

export interface MessengerChannelList {
  /** Providers this API build actually serves — the rest render as planned. */
  supported: string[];
  channels: MessengerChannel[];
}

export interface UpsertChannelBody {
  provider: string;
  label: string;
  secret?: Record<string, string>;
  config?: Record<string, unknown>;
  auto_reply?: boolean;
  reply_mode?: string;
  consent_mode?: string;
  active?: boolean;
}

export type UpdateChannelBody = Omit<UpsertChannelBody, 'provider' | 'label'> & { label?: string };

export interface ChannelSyncResult {
  fetched: number;
  error?: string;
  /** True when the channel is disabled: this fetch worked, but nothing recurs. */
  inactive?: boolean;
}

export interface ChannelTestResult {
  ok: boolean;
  detail: string;
  accountId?: string | null;
}

export const messengerService = {
  list: () => apiGet<MessengerChannelList>('/messenger/channels'),
  upsert: (body: UpsertChannelBody) => apiPost<MessengerChannel>('/messenger/channels', body),
  update: (id: string, body: UpdateChannelBody) =>
    apiPatch<MessengerChannel>(`/messenger/channels/${id}`, body),
  remove: (id: string) => apiDelete<{ deleted: boolean }>(`/messenger/channels/${id}`),
  test: (id: string) => apiPost<ChannelTestResult>(`/messenger/channels/${id}/test`),
  sync: (id: string) => apiPost<ChannelSyncResult>(`/messenger/channels/${id}/sync`),
  registerWebhook: (id: string) =>
    apiPost<{ webhookUrl: string }>(`/messenger/channels/${id}/register-webhook`),
};
