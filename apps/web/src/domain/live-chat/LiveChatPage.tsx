import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send,
  Sparkles,
  User,
  UserPlus,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  BookPlus,
  BookOpen,
  Bot,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { ChannelBadge, CHANNEL_FILTERS, RECEIVE_ONLY_CHANNELS } from './ChannelBadge';
import { SessionAlias } from './SessionAlias';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { Input, FormRow } from '@/components/Field';
import { toast } from '@/store/toast-store';
import {
  useSessions,
  useBriefing,
  useConversation,
  useConversationActions,
  useAskKnowledge,
  useCustomerActions,
} from './live-chat.hooks';
import { KnowledgeCaptureModal } from './KnowledgeCaptureModal';
import { IssuePanel } from './IssuePanel';
import { useAuthStore } from '@/store/auth-store';
import { liveChatService } from './live-chat.service';
import type { ChatMessage, CustomerContext } from './live-chat.service';
import { cn } from '@/lib/cn';

/** HH:mm for a message bubble; empty when the row carries no timestamp. */
function clockTime(value: string | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Local calendar day, used to decide where a date separator belongs. */
function dayKey(value: string | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function absTime(value: string | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function LiveChatPage() {
  const { t } = useTranslation('livechat');
  const { t: tc } = useTranslation('common');

  /** Compact relative time for the queue rows; absolute time goes in the tooltip. */
  const timeAgo = (value: string | undefined | null): string => {
    if (!value) return t('noReplyYet');
    const ms = Date.now() - new Date(value).getTime();
    if (Number.isNaN(ms) || ms < 0) return t('justNow');
    const min = Math.floor(ms / 60_000);
    if (min < 1) return t('justNow');
    if (min < 60) return t('minutesAgo', { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t('hoursAgo', { n: h });
    return t('daysAgo', { n: Math.floor(h / 24) });
  };
  const [searchParams] = useSearchParams();
  // Deep-link from the issue board (P4): /live-chat?conversation={id} opens
  // that thread directly (session-row ids ARE conversation ids).
  const [selected, setSelected] = useState<string | null>(
    () => searchParams.get('conversation'),
  );
  const [draft, setDraft] = useState('');
  /** In-flight latch for the reply send — see onSend. */
  const sendingRef = useRef(false);

  // 'all' by default: the queue-only view is what hid the conversation a shopper
  // was having right now with the bot (PLN-260807 D1).
  const [scope, setScope] = useState<'all' | 'queue' | 'ended'>('all');

  // Origin-channel filter (PLN-260810 PR-M4). Kept separate from `scope` so an
  // agent can watch, say, only KakaoTalk without losing the queue/ended split.
  const [channel, setChannel] = useState<string>('all');

  // Queue search box (customer name/email) — debounced into the list query.
  const [listQuery, setListQuery] = useState('');
  const [listSearch, setListSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setListSearch(listQuery), 300);
    return () => clearTimeout(timer);
  }, [listQuery]);

  // Deep link from the escalation alarm modal: /live-chat?c={conversationId}
  // opens the alerted conversation so the agent continues the thread (FR-S4).
  const deepLink = searchParams.get('c');
  useEffect(() => {
    if (deepLink) setSelected(deepLink);
  }, [deepLink]);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(listSearch, scope, channel);
  const { data: convo, isLoading: convoLoading, isFetching: convoFetching, refetch: refetchConvo } =
    useConversation(selected);
  const { data: briefingData, isLoading: briefingLoading } = useBriefing(selected);

  // Prefer the detail's channel (a deep-linked thread may not be in the list).
  const activeChannel = (
    convo?.channel ?? sessions?.find((s) => s.id === selected)?.channel ?? 'widget'
  ).toLowerCase();
  const receiveOnly = RECEIVE_ONLY_CHANNELS.has(activeChannel);
  // KB writes belong to knowledge owners; an agent handling the chat does not
  // automatically get to publish knowledge (PLN-260807 D3). Mirrors the server
  // rule — knowledge_source.manage is granted to master/director — so the
  // button never appears where the API would answer 403.
  const principal = useAuthStore((s) => s.principal);
  const canManageKnowledge =
    principal?.actorType === 'user' &&
    (principal.rank === 'master' || principal.rank === 'director');
  // Q/A pair an agent picked to turn into a knowledge document.
  const [capture, setCapture] = useState<{ question: string; answer: string } | null>(null);
  // Older blocks the agent pulled in, kept outside React Query: the 5s poll owns
  // the recent tail, this owns history, and mixing them in one cache entry would
  // let a poll wipe what was scrolled back to.
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [olderHasMore, setOlderHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => {
    setOlder([]);
    setOlderHasMore(true);
  }, [selected]);

  const messages = [...older, ...(convo?.messages ?? [])];
  const hasOlder = older.length ? olderHasMore : !!convo?.hasMore;

  const loadOlder = async () => {
    const oldest = messages[0]?.id;
    if (!selected || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await liveChatService.conversation(selected, oldest);
      setOlder((prev) => [...res.messages, ...prev]);
      setOlderHasMore(!!res.hasMore);
    } catch (e) {
      toast.error((e as Error).message || t('sendFailed'));
    } finally {
      setLoadingOlder(false);
    }
  };
  const { accept, end, send, handBack } = useConversationActions(selected);
  const [handBackOpen, setHandBackOpen] = useState(false);

  // Knowledge lookup (PLN-260810 S2/S3). Answer lives in component state, not
  // in the conversation: it is the agent checking, not a customer turn.
  const askKnowledge = useAskKnowledge();
  const [kbQuestion, setKbQuestion] = useState('');
  const lastCustomerMessage = [...(convo?.messages ?? [])]
    .reverse()
    .find((m) => m.senderType === 'user')?.body;
  const { link, create } = useCustomerActions(selected);

  // Customer match / create modals (FR-057).
  const [matchOpen, setMatchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerContext[]>([]);
  const [searching, setSearching] = useState(false);
  const [lead, setLead] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    if (!matchOpen) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setSearchResults(await liveChatService.searchCustomers(q));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, matchOpen]);

  const onLink = async (customerId: number) => {
    try {
      await link.mutateAsync(customerId);
      setMatchOpen(false);
      setSearchQuery('');
      toast.success(t('customerLinked'));
    } catch (e) {
      toast.error((e as Error).message || t('customerActionFailed'));
    }
  };

  const onCreate = async () => {
    if (!lead.name.trim() && !lead.email.trim()) {
      toast.warning(t('customerNeedsInfo'));
      return;
    }
    try {
      await create.mutateAsync({
        name: lead.name.trim() || undefined,
        email: lead.email.trim() || undefined,
        phone: lead.phone.trim() || undefined,
      });
      setCreateOpen(false);
      setLead({ name: '', email: '', phone: '' });
      toast.success(t('customerCreated'));
    } catch (e) {
      toast.error((e as Error).message || t('customerActionFailed'));
    }
  };

  const onSend = async () => {
    const body = draft.trim();
    // Ref, not `send.isPending`: two handler calls in the same tick both read the
    // render's stale value and both get through. This flips synchronously.
    if (!body || !selected || sendingRef.current) return;
    sendingRef.current = true;
    // Clear before awaiting: a reply takes seconds (moderation + mail), and the
    // text sitting in the box was half of how it got sent twice.
    setDraft('');
    try {
      await send.mutateAsync(body);
    } catch (e) {
      setDraft(body);
      const err = e as Error & { status?: number };
      if (err.status === 422) {
        toast.warning(t('messageBlocked'));
      } else {
        toast.error(err.message || t('sendFailed'));
      }
    } finally {
      sendingRef.current = false;
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
          <div className="flex gap-1 border-b border-gray-100 px-2 pt-2">
            {(['all', 'queue', 'ended'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs',
                  scope === key
                    ? 'border-primary-400 bg-primary-500/10 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {t(`scope.${key}`)}
              </button>
            ))}
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              aria-label={t('channel.filterLabel')}
              className="ml-auto rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none focus:border-primary-400"
            >
              {CHANNEL_FILTERS.map((key) => (
                <option key={key} value={key}>
                  {key === 'all' ? t('channel.filterAll') : t(`channel.${key}`, { defaultValue: key })}
                </option>
              ))}
            </select>
          </div>
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder={t('listSearchPlaceholder')}
                title={t('listSearchScope')}
                className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-xs text-gray-700 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </div>
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
                {/* A div, not a button: the row now contains its own controls
                    (alias edit + input) and a button may not nest interactive
                    elements. Keyboard access is kept explicitly. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(s.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return; // let the alias input type
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(s.id);
                    }
                  }}
                  className={cn(
                    'w-full cursor-pointer px-4 py-3 text-left hover:bg-gray-50',
                    selected === s.id && 'bg-primary-500/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Alias first, session label kept behind it — an agent
                        needs to know who this is, and still refers to the
                        thread by its label (PLN-260812). */}
                    <SessionAlias
                      conversationId={s.id}
                      alias={s.alias}
                      fallback={
                        s.customerName ||
                        s.customerEmail ||
                        t('sessionLabel', { id: s.id.slice(0, 6) })
                      }
                      sessionLabel={t('sessionLabel', { id: s.id.slice(0, 6) })}
                      compact
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <ChannelBadge channel={s.channel} />
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {s.lastMessagePreview ?? '—'}
                  </p>
                  <p
                    className="mt-0.5 text-[11px] text-gray-400"
                    title={`${t('createdShort')} ${absTime(s.createdAt)}${
                      s.lastMessageAt ? ` · ${t('lastReplyShort')} ${absTime(s.lastMessageAt)}` : ''
                    }`}
                  >
                    {t('createdShort')} {timeAgo(s.createdAt)} · {t('lastReplyShort')}{' '}
                    {timeAgo(s.lastMessageAt)}
                  </p>
                </div>
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
                <div className="flex min-w-0 items-center gap-2">
                  {/* Same editor as the list row, so the name can be set from
                      wherever the agent happens to be (PLN-260812 D-2). */}
                  <SessionAlias
                    conversationId={selected}
                    alias={convo?.alias}
                    fallback={convo?.customer?.name ?? t('conversation')}
                    sessionLabel={t('sessionLabel', { id: selected.slice(0, 6) })}
                  />
                  <StatusBadge status={convo?.status} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    title={t('syncHint')}
                    onClick={() => void refetchConvo()}
                    disabled={convoFetching}
                  >
                    <RefreshCw className={cn('h-4 w-4', convoFetching && 'animate-spin')} />
                    {t('sync')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => accept.mutate()}
                    disabled={accept.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t('accept')}
                  </Button>
                  {/* Handing back is only meaningful while a person owns the
                      thread; on any other status the API refuses it (409). */}
                  {convo?.status === 'agent' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      title={t('handBackHint')}
                      onClick={() => setHandBackOpen(true)}
                      disabled={handBack.isPending}
                    >
                      <Bot className="h-4 w-4" /> {t('handBack')}
                    </Button>
                  )}
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

              {/* Issue P1 (native tenants only — renders nothing when no issue). */}
              <IssuePanel conversationId={selected} />

              <div
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-busy={convoLoading}
                aria-label={t('messageThread')}
                className="flex-1 space-y-3 overflow-y-auto p-4"
              >
                {convoLoading && (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                )}
                {hasOlder && (
                  <div className="flex justify-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void loadOlder()}
                      disabled={loadingOlder}
                    >
                      {loadingOlder ? t('loading', { ns: 'common' }) : t('loadOlder')}
                    </Button>
                  </div>
                )}
                {messages.map((m, i) => {
                  const outbound = m.senderType === 'agent' || m.senderType === 'ai';
                  const day = dayKey(m.createdAt);
                  const showDay = day && day !== dayKey(messages[i - 1]?.createdAt);
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-2 flex items-center gap-2">
                          <span className="h-px flex-1 bg-gray-100" />
                          <span className="text-[11px] text-gray-400">{day}</span>
                          <span className="h-px flex-1 bg-gray-100" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'flex items-end gap-1.5',
                          outbound ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {outbound && (
                          <span className="shrink-0 text-[11px] text-gray-400">
                            {clockTime(m.createdAt)}
                          </span>
                        )}
                      <div
                        className={cn(
                          'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                          m.senderType === 'agent'
                            ? 'bg-primary-500 text-white'
                            : m.senderType === 'ai'
                              ? 'bg-primary-500/10 text-primary-700'
                              : m.senderType === 'system'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-gray-100 text-gray-700',
                        )}
                      >
                        {m.senderType === 'ai' && (
                          <span className="mb-0.5 flex items-center gap-1 text-xs font-medium">
                            <Sparkles className="h-3 w-3" /> AI
                          </span>
                        )}
                        {m.senderType === 'agent' && (
                          <span className="mb-0.5 flex items-center gap-1 text-xs font-medium opacity-90">
                            <User className="h-3 w-3" /> {m.senderName ?? t('agent')}
                          </span>
                        )}
                        {m.body}
                        {m.senderType === 'ai' && canManageKnowledge && (
                          <button
                            type="button"
                            onClick={() =>
                              setCapture({
                                // The customer turn this answer replied to.
                                question:
                                  [...messages]
                                    .slice(0, i)
                                    .reverse()
                                    .find((p) => p.senderType === 'user')?.body ?? '',
                                answer: m.body,
                              })
                            }
                            className="mt-1 flex items-center gap-1 text-[11px] text-primary-600 underline-offset-2 hover:underline"
                          >
                            <BookPlus className="h-3 w-3" /> {t('knowledge.action')}
                          </button>
                        )}
                      </div>
                        {!outbound && (
                          <span className="shrink-0 text-[11px] text-gray-400">
                            {clockTime(m.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {convo && messages.length === 0 && !convoLoading && (
                  <p className="text-center text-sm text-gray-400">{t('noMessages')}</p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-100 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Korean/Japanese IME: the Enter that commits a composition
                    // fires keydown as well, so a single press produced two
                    // sends 65ms apart — and two emails to the customer.
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                    void onSend();
                  }}
                  disabled={receiveOnly}
                  placeholder={receiveOnly ? t('channel.receiveOnlyHint') : t('replyPlaceholder')}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                />
                <Button
                  onClick={onSend}
                  // The platform rejects a reply on these threads (SMS relay),
                  // so the composer says so instead of failing after the send.
                  disabled={receiveOnly || send.isPending || !draft.trim()}
                  aria-label={t('send')}
                >
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
              {!selected
                ? t('selectConversation')
                : briefingLoading
                  ? t('briefingLoading')
                  : briefingData?.briefing || t('noBriefing')}
            </p>
          </div>

          {/* Knowledge lookup + draft delivery (PLN-260810 S2/S3). Read-only:
              asking never touches the conversation, and sending goes through
              the normal agent-reply path so moderation and the audit trail
              apply exactly as they do to anything a person types. */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <BookOpen className="h-4 w-4 text-primary-500" /> {t('kbLookup')}
            </div>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
              rows={2}
              value={kbQuestion}
              onChange={(e) => setKbQuestion(e.target.value)}
              placeholder={t('kbQuestionPlaceholder')}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!lastCustomerMessage}
                onClick={() => setKbQuestion(lastCustomerMessage ?? '')}
              >
                {t('kbUseLastMessage')}
              </Button>
              <Button
                size="sm"
                disabled={!kbQuestion.trim() || askKnowledge.isPending}
                onClick={() =>
                  askKnowledge.mutate({ question: kbQuestion.trim(), language: 'EN' })
                }
              >
                {askKnowledge.isPending ? tc('loading') : t('kbAsk')}
              </Button>
            </div>

            {askKnowledge.data && (
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                {askKnowledge.data.blocked ? (
                  <p className="text-sm text-red-600">{t('kbBlocked')}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-gray-800">
                    {askKnowledge.data.answer}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  {askKnowledge.data.sources.length === 0
                    ? t('kbNoSources')
                    : t('kbSourceCount', { count: askKnowledge.data.sources.length })}
                </p>
                <ul className="space-y-1 text-xs">
                  {askKnowledge.data.sources.map((src) => (
                    <li key={src.id} className="flex items-center gap-1 text-gray-600">
                      <a
                        className="truncate underline-offset-2 hover:underline"
                        href={`/knowledge?doc=${src.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {src.title}
                      </a>
                      {src.stale && <Badge tone="warning">{t('kbStale')}</Badge>}
                      {src.conflicted && <Badge tone="error">{t('kbConflicted')}</Badge>}
                    </li>
                  ))}
                </ul>
                {!askKnowledge.data.blocked && askKnowledge.data.answer && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={!selected || send.isPending || receiveOnly}
                      onClick={() => void send.mutateAsync(askKnowledge.data!.answer)}
                    >
                      {t('kbSendToCustomer')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDraft(askKnowledge.data!.answer)}
                    >
                      {t('kbEditThenSend')}
                    </Button>
                  </div>
                )}
              </div>
            )}
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
            {selected && (
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearchQuery('');
                    setMatchOpen(true);
                  }}
                >
                  <Search className="h-4 w-4" /> {t('matchCustomer')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
                  <UserPlus className="h-4 w-4" /> {t('createCustomer')}
                </Button>
              </div>
            )}
          </div>

          {convo?.customer?.recentOrders && convo.customer.recentOrders.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-gray-800">{t('recentOrders')}</div>
              <ul className="space-y-2">
                {convo.customer.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">#{o.id}</span>
                    <StatusBadge status={o.status ?? undefined} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Match an existing customer to this chat (FR-057). */}
      {/* Handback confirmation (PLN-260810 S1). The thread keeps running, so
          the dialog says what changes and what does not — an agent reading
          "hand back" could reasonably fear it closes the conversation. */}
      <Modal
        open={handBackOpen}
        onClose={() => setHandBackOpen(false)}
        title={t('handBack')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setHandBackOpen(false)}>
              {tc('close')}
            </Button>
            <Button
              disabled={handBack.isPending}
              onClick={() =>
                handBack.mutate(undefined, { onSuccess: () => setHandBackOpen(false) })
              }
            >
              {handBack.isPending ? tc('loading') : t('handBack')}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-gray-700">
          <p>{t('handBackExplain')}</p>
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            {t('handBackNoticePreview')}
          </p>
        </div>
      </Modal>

      <KnowledgeCaptureModal
        open={!!capture}
        question={capture?.question ?? ''}
        answer={capture?.answer ?? ''}
        conversationId={selected}
        onClose={() => setCapture(null)}
      />

      <Modal
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
        title={t('matchCustomerTitle')}
        size="sm"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('matchSearchPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {searching && <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-400" />}
          {!searching && searchQuery.trim() && searchResults.length === 0 && (
            <p className="py-3 text-center text-sm text-gray-400">{t('noMatches')}</p>
          )}
          {searchResults.map((c) => (
            <button
              key={c.id}
              onClick={() => c.id != null && onLink(c.id)}
              disabled={link.isPending}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span>
                <span className="font-medium text-gray-800">{c.name ?? t('noName')}</span>
                <span className="block text-xs text-gray-500">{c.email ?? c.phone ?? '—'}</span>
              </span>
              {c.tier && <Badge tone="primary">{c.tier}</Badge>}
            </button>
          ))}
        </div>
      </Modal>

      {/* Save the chat contact as a new customer (FR-057). */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('createCustomerTitle')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('cancel', { ns: 'common' })}
            </Button>
            <Button onClick={onCreate} disabled={create.isPending}>
              {t('save', { ns: 'common' })}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormRow label={t('name')}>
            <Input
              value={lead.name}
              onChange={(e) => setLead((s) => ({ ...s, name: e.target.value }))}
            />
          </FormRow>
          <FormRow label={t('email')}>
            <Input
              type="email"
              value={lead.email}
              onChange={(e) => setLead((s) => ({ ...s, email: e.target.value }))}
            />
          </FormRow>
          <FormRow label={t('phone')}>
            <Input
              value={lead.phone}
              onChange={(e) => setLead((s) => ({ ...s, phone: e.target.value }))}
            />
          </FormRow>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-700">{value ?? '—'}</dd>
    </div>
  );
}
