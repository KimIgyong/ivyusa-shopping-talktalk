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
  Paperclip,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { ChannelBadge, CHANNEL_FILTERS, RECEIVE_ONLY_CHANNELS } from './ChannelBadge';
import { SessionAlias } from './SessionAlias';
import { AutoReplyControl } from './AutoReplyControl';
import { DraftPanel } from './DraftPanel';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { Input, FormRow } from '@/components/Field';
import { toast } from '@/store/toast-store';
import {
  useSessions,
  useConversation,
  useConversationActions,
  useAskKnowledge,
  useProposeAnswer,
  useCustomerActions,
} from './live-chat.hooks';
import { BriefingCard } from './BriefingCard';
import { CommentCard } from './CommentCard';
import { GroupCreateModal } from './GroupCreateModal';
import { GroupRoom } from './GroupRoom';
import { useGroups } from './live-chat.hooks';
import { KnowledgeCaptureModal } from './KnowledgeCaptureModal';
import { MessageAttachments } from './MessageAttachments';
import { useAgentUpload } from './useAgentUpload';
import { IssuePanel } from './IssuePanel';
import { useAuthStore } from '@/store/auth-store';
import { liveChatService } from './live-chat.service';
import type { AgentSession, ChatMessage, CustomerContext } from './live-chat.service';
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
  // Files the agent picked for this reply (PLN-260814 S4).
  const uploads = useAgentUpload(selected);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function pickFiles(files: FileList | null) {
    if (!files?.length) return;
    const problem = await uploads.add(Array.from(files));
    if (problem) setUploadNotice(problem);
  }

  // 'all' by default: the queue-only view is what hid the conversation a shopper
  // was having right now with the bot (PLN-260807 D1). 'groups' switches the
  // list to timeline/project groups (REQ-260824-Session-Grouping).
  const [scope, setScope] = useState<'all' | 'queue' | 'ended' | 'groups'>('all');

  // Session grouping (REQ-260824): the open group room, the list's multi-select
  // mode, and the sessions checked for grouping (keyed by sessionId — two rows
  // of the same session collapse into one member).
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Map<string, AgentSession>>(new Map());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const exitSelectMode = () => {
    setSelectMode(false);
    setChecked(new Map());
  };
  const toggleChecked = (s: AgentSession) => {
    if (!s.sessionId) return;
    setChecked((prev) => {
      const next = new Map(prev);
      if (next.has(s.sessionId as string)) next.delete(s.sessionId as string);
      else next.set(s.sessionId as string, s);
      return next;
    });
  };

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
  const { data: sessions, isLoading: sessionsLoading } = useSessions(
    listSearch,
    scope === 'groups' ? 'all' : scope,
    channel,
  );
  const { data: groups, isLoading: groupsLoading } = useGroups(scope === 'groups');
  const { data: convo, isLoading: convoLoading, isFetching: convoFetching, refetch: refetchConvo } =
    useConversation(selected);

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
  const { i18n } = useTranslation();
  const askKnowledge = useAskKnowledge();
  const proposeAnswer = useProposeAnswer();
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
    const attachmentIds = uploads.ready.map((a) => a.id);
    // Ref, not `send.isPending`: two handler calls in the same tick both read the
    // render's stale value and both get through. This flips synchronously.
    // Files alone make a valid reply; an upload still running does not.
    if ((!body && !attachmentIds.length) || !selected || sendingRef.current || uploads.busy) return;
    sendingRef.current = true;
    // Clear before awaiting: a reply takes seconds (moderation + mail), and the
    // text sitting in the box was half of how it got sent twice.
    setDraft('');
    try {
      await send.mutateAsync({ body, attachmentIds });
      // Cleared only once the send succeeded: on failure the files are still
      // uploaded and still attachable, so the agent retries instead of
      // hunting for them again.
      uploads.clear();
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
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-600">
            <span>
              {scope === 'groups'
                ? `${t('groups.tab')} ${groups ? `(${groups.length})` : ''}`
                : `${t('sessions')} ${sessions ? `(${sessions.length})` : ''}`}
            </span>
            {scope !== 'groups' && (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  selectMode
                    ? 'border-primary-400 bg-primary-500/10 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {selectMode ? t('groups.cancel') : t('groups.selectMode')}
              </button>
            )}
          </div>
          <div className="flex gap-1 border-b border-gray-100 px-2 pt-2">
            {(['all', 'queue', 'ended', 'groups'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setScope(key);
                  if (key === 'groups') exitSelectMode();
                  else setSelectedGroup(null);
                }}
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
          {/* Group tab: timeline/project list (REQ-260824). */}
          {scope === 'groups' && (
            <>
              {groupsLoading && (
                <div className="p-6 text-center text-sm text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </div>
              )}
              {!groupsLoading && (!groups || groups.length === 0) && (
                <p className="p-6 text-center text-sm text-gray-400">{t('groups.empty')}</p>
              )}
              <ul className="divide-y divide-gray-100">
                {groups?.map((g) => (
                  <li key={g.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedGroup(g.id);
                        setSelected(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedGroup(g.id);
                          setSelected(null);
                        }
                      }}
                      className={cn(
                        'w-full cursor-pointer px-4 py-3 text-left hover:bg-gray-50',
                        selectedGroup === g.id && 'bg-primary-500/5',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={g.kind === 'project' ? 'info' : 'primary'}>
                          {t(`groups.kindLabel.${g.kind}`, { defaultValue: g.kind })}
                        </Badge>
                        <span className="truncate text-sm font-medium text-gray-800">{g.title}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {t('groups.memberCount', { count: g.memberCount })} · {t('lastReplyShort')}{' '}
                        {timeAgo(g.lastMessageAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {scope !== 'groups' && sessionsLoading && (
            <div className="p-6 text-center text-sm text-gray-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          )}
          {scope !== 'groups' && !sessionsLoading && (!sessions || sessions.length === 0) && (
            <p className="p-6 text-center text-sm text-gray-400">{t('noActiveSessions')}</p>
          )}
          <ul className="divide-y divide-gray-100">
            {scope !== 'groups' && sessions?.map((s) => (
              <li key={s.id}>
                {/* A div, not a button: the row now contains its own controls
                    (alias edit + input) and a button may not nest interactive
                    elements. Keyboard access is kept explicitly. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (selectMode) {
                      toggleChecked(s);
                    } else {
                      setSelected(s.id);
                      setSelectedGroup(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return; // let the alias input type
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (selectMode) {
                        toggleChecked(s);
                      } else {
                        setSelected(s.id);
                        setSelectedGroup(null);
                      }
                    }
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-start gap-2 px-4 py-3 text-left hover:bg-gray-50',
                    selected === s.id && !selectMode && 'bg-primary-500/5',
                    selectMode && s.sessionId && checked.has(s.sessionId) && 'bg-primary-500/5',
                  )}
                >
                  {/* Multi-select for grouping (REQ-260824). */}
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={!!s.sessionId && checked.has(s.sessionId)}
                      onChange={() => toggleChecked(s)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('groups.selectSession')}
                      className="mt-1 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                  {/* Two lines instead of one (REQ-260824 R1): the name gets
                      the full row width, and session label + channel + status
                      stop competing with it for space. */}
                  <SessionAlias
                    conversationId={s.id}
                    alias={s.alias}
                    fallback={
                      s.customerName ||
                      s.customerEmail ||
                      t('sessionLabel', { id: s.id.slice(0, 6) })
                    }
                    compact
                  />
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {t('sessionLabel', { id: s.id.slice(0, 6) })}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* Silent thread, at a glance: the AI is not answering
                          this one and no agent has taken it either. */}
                      {s.autoReplyEffective === false && s.status !== 'agent' && (
                        <span
                          className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
                          title={t('autoReply.offHint')}
                        >
                          {t('autoReply.offShort')}
                        </span>
                      )}
                      <ChannelBadge channel={s.channel} />
                      <StatusBadge
                        status={s.status}
                        label={t(`status.${s.status}`, { defaultValue: s.status })}
                      />
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
                </div>
              </li>
            ))}
          </ul>
          {/* Grouping action bar (REQ-260824): visible only in select mode. */}
          {selectMode && scope !== 'groups' && (
            <div className="sticky bottom-0 border-t border-gray-200 bg-white p-2">
              <p className="mb-1 text-xs text-gray-500">
                {t('groups.selectedCount', { count: checked.size })}
              </p>
              <div className="flex gap-1">
                <Button size="sm" disabled={!checked.size} onClick={() => setGroupModalOpen(true)}>
                  {t('groups.openModal')}
                </Button>
                <Button size="sm" variant="ghost" onClick={exitSelectMode}>
                  {t('groups.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Message thread */}
        <div className="col-span-6 flex flex-col rounded-lg border border-gray-200 bg-white">
          {/* Group room replaces the thread pane while a group is open. */}
          {selectedGroup && (
            <GroupRoom groupId={selectedGroup} onDissolved={() => setSelectedGroup(null)} />
          )}
          {!selectedGroup && !selected && (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
              {t('selectSession')}
            </div>
          )}
          {!selectedGroup && selected && (
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
                  <StatusBadge
                    status={convo?.status}
                    label={
                      convo?.status
                        ? t(`status.${convo.status}`, { defaultValue: convo.status })
                        : undefined
                    }
                  />
                  <AutoReplyControl
                    conversationId={selected}
                    mode={convo?.autoReplyMode}
                    effective={convo?.autoReplyEffective}
                    agentOwns={convo?.status === 'agent'}
                    awaitingApproval={!!convo?.pendingDraft}
                  />
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
                        {m.attachments && m.attachments.length > 0 && (
                          <MessageAttachments attachments={m.attachments} outbound={outbound} />
                        )}
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

              {convo?.pendingDraft && (
                <DraftPanel conversationId={selected} draft={convo.pendingDraft} />
              )}

              {/* Attachment tray: uploading, failed, and ready-to-send files */}
              {(uploads.pending.length > 0 || uploadNotice) && (
                <div className="space-y-1 border-t border-gray-100 px-3 pt-2">
                  {uploadNotice && (
                    <div className="flex items-start gap-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                      <span className="min-w-0 flex-1">{uploadNotice}</span>
                      <button
                        type="button"
                        onClick={() => setUploadNotice(null)}
                        aria-label={t('attachment.close')}
                        className="opacity-70 hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {uploads.pending.map((p) => (
                    <div
                      key={p.key}
                      className={cn(
                        'flex items-center gap-2 rounded border px-2 py-1 text-xs',
                        p.error ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50',
                      )}
                    >
                      {p.previewUrl ? (
                        <img src={p.previewUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      ) : (
                        <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{p.error ?? p.name}</div>
                        {!p.attachment && !p.error && (
                          <>
                            <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-gray-200">
                              <div
                                className="h-full bg-primary-500 transition-all"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                            {/* Bytes delivered, server still converting (HEIC ≈ 1s). */}
                            {p.progress >= 99 && (
                              <div className="mt-0.5 text-[10px] text-gray-500">
                                {t('attachment.processing')}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => uploads.remove(p.key)}
                        aria-label={t('attachment.remove', { name: p.name })}
                        className="shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-gray-100 p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.avif,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    void pickFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={receiveOnly}
                  aria-label={t('attachment.attach')}
                  title={t('attachment.attach')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
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
                  disabled={
                    receiveOnly ||
                    send.isPending ||
                    uploads.busy ||
                    (!draft.trim() && !uploads.ready.length)
                  }
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
          {/* On-demand briefing + translation (REQ-260824 R3). */}
          <BriefingCard conversationId={selected} />

          {/* Internal notes on the thread / its session (REQ-260824 R4). */}
          <CommentCard conversationId={selected} />

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
                  // The agent is the reader here, so the console's language is
                  // the right one. (The customer's session language is not part
                  // of the conversation DTO this view receives.)
                  askKnowledge.mutate({
                    question: kbQuestion.trim(),
                    language: i18n.language.toUpperCase(),
                  })
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
                    {/* Anyone handling a chat may propose; only a knowledge
                        owner can approve it (PLN-260810 D3). */}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={proposeAnswer.isPending || !kbQuestion.trim()}
                      onClick={() =>
                        proposeAnswer.mutate({
                          conversationId: selected ? Number(selected) : undefined,
                          question: kbQuestion.trim(),
                          answer: askKnowledge.data!.answer,
                        })
                      }
                    >
                      {t('kbProposeKnowledge')}
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

      {/* Timeline/project grouping of the checked sessions (REQ-260824). */}
      <GroupCreateModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        sessions={[...checked.values()]}
        onDone={() => {
          setGroupModalOpen(false);
          exitSelectMode();
          setScope('groups');
        }}
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
