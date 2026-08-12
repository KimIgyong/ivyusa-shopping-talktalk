import { Bot, Headset } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useSetSessionAutoReply } from './live-chat.hooks';

/**
 * Whether the AI answers this session (PLN-260812 FR-2/4).
 *
 * Three states, not two: `inherit` keeps following the channel default from
 * Settings, so changing that default still reaches every conversation nobody
 * has opted out of. A two-way switch would freeze each session the first time
 * it was touched.
 *
 * The badge next to it answers the question the operator actually has — is the
 * AI replying right now? — which `inherit` alone cannot tell them.
 */
export function AutoReplyControl({
  conversationId,
  mode,
  effective,
  agentOwns,
}: {
  conversationId: string;
  mode?: string;
  /** Mode resolved against the channel default. */
  effective?: boolean;
  /** An agent holding the thread outranks every setting here. */
  agentOwns?: boolean;
}) {
  const { t } = useTranslation('livechat');
  const save = useSetSessionAutoReply();
  const current = mode ?? 'inherit';
  const aiAnswering = !agentOwns && effective !== false;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <select
        value={current}
        disabled={save.isPending}
        onChange={(e) => save.mutate({ id: conversationId, mode: e.target.value })}
        title={t('autoReply.hint')}
        aria-label={t('autoReply.label')}
        className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-600 outline-none focus:border-primary-400"
      >
        <option value="inherit">
          {t('autoReply.inherit', {
            state: effective ? t('autoReply.on') : t('autoReply.off'),
          })}
        </option>
        <option value="on">{t('autoReply.on')}</option>
        <option value="off">{t('autoReply.off')}</option>
      </select>
      <span
        className={cn(
          'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
          aiAnswering ? 'bg-primary-500/10 text-primary-700' : 'bg-gray-100 text-gray-500',
        )}
        title={agentOwns ? t('autoReply.agentOwnsHint') : undefined}
      >
        {aiAnswering ? <Bot className="h-3 w-3" /> : <Headset className="h-3 w-3" />}
        {aiAnswering ? t('autoReply.aiAnswering') : t('autoReply.agentAnswering')}
      </span>
    </span>
  );
}
