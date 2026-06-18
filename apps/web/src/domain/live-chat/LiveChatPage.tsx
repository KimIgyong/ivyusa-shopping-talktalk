import { useState } from 'react';
import { Send, Sparkles, User, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/Badge';
import { toast } from '@/store/toast-store';
import { useSessions, useConversation, useConversationActions } from './live-chat.hooks';
import { cn } from '@/lib/cn';

export function LiveChatPage() {
  const { t } = useTranslation('livechat');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: convo, isLoading: convoLoading } = useConversation(selected);
  const { accept, end, send } = useConversationActions(selected);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || !selected) return;
    try {
      await send.mutateAsync(body);
      setDraft('');
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 422) {
        toast.warning(t('messageBlocked'));
      } else {
        toast.error(err.message || t('sendFailed'));
      }
    }
  };

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="grid h-[calc(100vh-220px)] grid-cols-12 gap-4">
        {/* Session list */}
        <div className="col-span-3 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-600">
            {t('sessions')} {sessions ? `(${sessions.length})` : ''}
          </div>
          {sessionsLoading && (
            <div className="p-6 text-center text-sm text-gray-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          )}
          {!sessionsLoading && (!sessions || sessions.length === 0) && (
            <p className="p-6 text-center text-sm text-gray-400">{t('noActiveSessions')}</p>
          )}
          <ul className="divide-y divide-gray-100">
            {sessions?.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(s.id)}
                  className={cn(
                    'w-full px-4 py-3 text-left hover:bg-gray-50',
                    selected === s.id && 'bg-primary-500/5',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">
                      {s.customerName ?? t('sessionLabel', { id: s.id.slice(0, 6) })}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{s.lastMessage ?? '—'}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Message thread */}
        <div className="col-span-6 flex flex-col rounded-lg border border-gray-200 bg-white">
          {!selected && (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
              {t('selectSession')}
            </div>
          )}
          {selected && (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {convo?.customer?.name ?? t('conversation')}
                  </span>
                  <StatusBadge status={convo?.status} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => accept.mutate()}
                    disabled={accept.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t('accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => end.mutate()}
                    disabled={end.isPending}
                  >
                    <XCircle className="h-4 w-4" /> {t('end')}
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {convoLoading && (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                )}
                {convo?.messages?.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex',
                      m.role === 'agent' || m.role === 'ai' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                        m.role === 'agent'
                          ? 'bg-primary-500 text-white'
                          : m.role === 'ai'
                            ? 'bg-primary-500/10 text-primary-700'
                            : m.role === 'system'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-gray-100 text-gray-700',
                      )}
                    >
                      {m.role === 'ai' && (
                        <span className="mb-0.5 flex items-center gap-1 text-xs font-medium">
                          <Sparkles className="h-3 w-3" /> AI
                        </span>
                      )}
                      {m.body}
                    </div>
                  </div>
                ))}
                {convo && convo.messages.length === 0 && !convoLoading && (
                  <p className="text-center text-sm text-gray-400">{t('noMessages')}</p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-100 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSend()}
                  placeholder={t('replyPlaceholder')}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
                />
                <Button onClick={onSend} disabled={send.isPending || !draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Context + briefing */}
        <div className="col-span-3 space-y-4 overflow-y-auto">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Sparkles className="h-4 w-4 text-primary-500" /> {t('aiBriefing')}
            </div>
            <p className="text-sm text-gray-600">
              {selected
                ? convo?.briefing ?? t('noBriefing')
                : t('selectConversation')}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <User className="h-4 w-4 text-gray-500" /> {t('customer')}
            </div>
            {convo?.customer ? (
              <dl className="space-y-2 text-sm">
                <Row label={t('name')} value={convo.customer.name} />
                <Row label={t('email')} value={convo.customer.email} />
                <Row label={t('phone')} value={convo.customer.phone} />
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">{t('tier')}</dt>
                  <dd>{convo.customer.tier ? <Badge tone="primary">{convo.customer.tier}</Badge> : '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-gray-400">{t('noCustomerContext')}</p>
            )}
          </div>

          {convo?.customer?.recentOrders && convo.customer.recentOrders.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-gray-800">{t('recentOrders')}</div>
              <ul className="space-y-2">
                {convo.customer.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">#{o.id}</span>
                    <StatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-700">{value ?? '—'}</dd>
    </div>
  );
}
