import { AlertTriangle, MessageSquare, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import type { MessengerChannel } from './messenger.service';
import { UNOFFICIAL_PROVIDERS } from './messenger.service';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * One messenger channel card (PLN-260810 PR-M5).
 *
 * Unlike the store/marketing tiles this shows live operating state, because a
 * channel that stopped receiving is invisible otherwise: connection status,
 * last inbound, the last error, and whether AI answers on it.
 */
export function MessengerChannelCard({
  provider,
  channel,
  planned,
  onConfigure,
  onTest,
  onSync,
}: {
  provider: string;
  channel?: MessengerChannel;
  /** Listed in the requirement but not served by this build yet. */
  planned?: boolean;
  onConfigure: () => void;
  onTest?: () => void;
  onSync?: () => void;
}) {
  const { t } = useTranslation('settings');
  const unofficial = UNOFFICIAL_PROVIDERS.has(provider);
  const status = channel?.status ?? 'unknown';
  const tone = status === 'connected' ? 'success' : status === 'error' ? 'error' : undefined;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold text-gray-900">
              {t(`messenger.provider.${provider}.title`, { defaultValue: provider })}
              {channel?.label ? <span className="text-gray-400"> · {channel.label}</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {t(`messenger.provider.${provider}.subtitle`, { defaultValue: '' })}
            </p>
          </div>
        </div>
        {planned ? (
          <Badge>{t('messenger.state.planned')}</Badge>
        ) : tone ? (
          <Badge tone={tone}>{t(`messenger.state.${status}`)}</Badge>
        ) : (
          <Badge>{t('messenger.state.unknown')}</Badge>
        )}
      </div>

      {/* Credentials verified but the channel is off: nothing is being
          received, and "연결됨" alone reads as if it were. */}
      {channel?.credentialSet && !channel.active && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-[11px] leading-snug text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('messenger.inactiveWarning')}
        </p>
      )}

      {unofficial && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('messenger.unofficialWarning')}
        </p>
      )}

      <div className="mb-4 space-y-0.5 text-xs text-gray-500">
        {planned ? (
          <p className="text-gray-400">{t('messenger.plannedHint')}</p>
        ) : (
          <>
            <p>
              {t('messenger.credential')}:{' '}
              {channel?.credentialSet ? t('connected') : t('notSet')}
            </p>
            <p>
              {t('messenger.autoReply')}:{' '}
              {channel
                ? t(`messenger.mode.${channel.replyMode ?? (channel.autoReply ? 'auto' : 'off')}`, {
                    defaultValue: channel.replyMode ?? '',
                  })
                : '—'}
              {channel ? ` · ${channel.active ? t('messenger.enabled') : t('messenger.disabled')}` : ''}
            </p>
            {/* Half of the "the toggle does nothing" report was this sentence
                missing: the channel value is a default for future messages. */}
            {channel && <p className="text-gray-400">{t('messenger.autoReplyScope')}</p>}
            <p className="text-gray-400">
              {t('messenger.lastInbound')}: {fmtDate(channel?.lastSyncAt)}
            </p>
            {/* The failure an operator must see: a channel silently stopped. */}
            {channel?.lastError && (
              <p className="truncate text-red-600" title={channel.lastError}>
                {t('messenger.lastError')}: {channel.lastError}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onConfigure} disabled={planned}>
          <Settings2 className="mr-1.5 h-4 w-4" />
          {t('configure')}
        </Button>
        {channel && onTest && (
          <Button variant="secondary" size="sm" onClick={onTest}>
            {t('messenger.test')}
          </Button>
        )}
        {channel && onSync && (
          <Button variant="secondary" size="sm" onClick={onSync}>
            {t('messenger.syncNow')}
          </Button>
        )}
      </div>
    </div>
  );
}
