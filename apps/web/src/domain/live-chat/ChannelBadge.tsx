import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

/**
 * Channels an agent can see in the queue. Order is the filter order: the
 * widget first (most traffic), then messengers, then email.
 */
export const CHANNEL_FILTERS = [
  'all',
  'widget',
  'telegram',
  'viber',
  'zalo',
  'line',
  'whatsapp',
  'kakao',
  'sms',
  'email',
] as const;

export type ChannelKey = (typeof CHANNEL_FILTERS)[number];

/** Per-channel tint. Distinct hues, all readable on white at 11px. */
const TONE: Record<string, string> = {
  widget: 'border-gray-200 bg-gray-50 text-gray-600',
  telegram: 'border-sky-200 bg-sky-50 text-sky-700',
  viber: 'border-violet-200 bg-violet-50 text-violet-700',
  zalo: 'border-blue-200 bg-blue-50 text-blue-700',
  line: 'border-green-200 bg-green-50 text-green-700',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  kakao: 'border-amber-200 bg-amber-50 text-amber-800',
  sms: 'border-orange-200 bg-orange-50 text-orange-700',
  email: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

/** Threads the platform will not let us answer — the composer is disabled too. */
export const RECEIVE_ONLY_CHANNELS = new Set(['sms']);

/**
 * Origin-channel chip on a conversation row (PLN-260810 PR-M4). It tells the
 * agent what they are about to reply into — a KakaoTalk relay room behaves
 * differently from the widget, and an SMS thread cannot be replied to at all.
 */
export function ChannelBadge({ channel }: { channel?: string | null }) {
  const { t } = useTranslation('liveChat');
  const key = (channel || 'widget').toLowerCase();
  const receiveOnly = RECEIVE_ONLY_CHANNELS.has(key);

  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        TONE[key] ?? 'border-gray-200 bg-gray-50 text-gray-600',
      )}
      // Unknown channels fall back to their raw key rather than disappearing:
      // a new adapter must be visible before its label ships.
      title={receiveOnly ? t('channel.receiveOnlyHint') : undefined}
    >
      {t(`channel.${key}`, { defaultValue: key })}
      {receiveOnly ? ` · ${t('channel.receiveOnlyShort')}` : ''}
    </span>
  );
}
