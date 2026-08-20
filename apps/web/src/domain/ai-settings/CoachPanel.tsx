import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Plus, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Select } from '@/components/Field';
import { cn } from '@/lib/cn';
import { toast } from '@/store/toast-store';
import { coachService, type CoachProposal } from './coach.service';
import { useCoachThread, useCoachThreads, useCreateCoachThread } from './coach.hooks';
import { useAiSettings } from './ai-settings.hooks';
import { ProposalCard } from './ProposalCard';

/**
 * Admin↔agent coaching chat (FR-071). The other tab simulates a shopper; this
 * one talks to the agent about its own behavior and turns the conclusions into
 * proposals the admin approves.
 */
interface CoachPanelProps {
  /** An answer handed over from the preview tab, pending attachment to the next turn. */
  target?: { messageId: number; question: string; answer: string } | null;
  onClearTarget?: () => void;
  /** Send a question back to the preview tab to be re-asked after a change. */
  onVerifyInPreview?: (question: string) => void;
  /** Which AI agent NEW threads coach (PLN-260820); null = the default agent. */
  agentId?: number | null;
}

export function CoachPanel({ target, onClearTarget, onVerifyInPreview, agentId }: CoachPanelProps = {}) {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');

  const { data: threads, isLoading: threadsLoading } = useCoachThreads();
  const { data: aiSettings } = useAiSettings();
  const createThread = useCreateCoachThread();
  const [threadId, setThreadId] = useState<number | null>(null);
  const { data: detail, isLoading: detailLoading, refetch } = useCoachThread(threadId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Land on the most recent thread so the panel is usable without a first click.
  useEffect(() => {
    if (threadId === null && threads?.items?.length) setThreadId(threads.items[0].id);
  }, [threads, threadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [detail?.messages.length, busy]);

  async function startThread() {
    const created = await createThread.mutateAsync({ aiAgentId: agentId });
    setThreadId(created.id);
  }

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;

    // No thread yet (first use) — open one, then send into it.
    let threadTarget = threadId;
    if (threadTarget === null) {
      try {
        const created = await createThread.mutateAsync({ aiAgentId: agentId });
        threadTarget = created.id;
        setThreadId(created.id);
      } catch {
        return; // the hook already surfaced the error
      }
    }

    setInput('');
    setBusy(true);
    try {
      await coachService.send(threadTarget, text, target?.messageId);
      onClearTarget?.(); // the turn now owns the reference; the chip is done
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
      setInput(text); // give the text back rather than losing what they typed
    } finally {
      setBusy(false);
    }
  }

  const messages = detail?.messages ?? [];

  // Two independent ways coaching ends up on the stub, and the operator needs
  // to know about both: the engine is configured that way, or a real engine was
  // configured and failed at request time (bad key), which the gateway hides by
  // degrading to the stub. Configuration alone would miss the second.
  /** The customer question behind an agent turn, when one was attached upstream. */
  function refQuestionFor(agentMessageId: number): string | undefined {
    const idx = messages.findIndex((m) => m.id === agentMessageId);
    if (idx < 0) return undefined;
    for (let i = idx; i >= 0; i--) {
      if (messages[i].refTurn) return messages[i].refTurn!.question;
    }
    return undefined;
  }

  const coachSetting = aiSettings?.find((s) => s.function === 'coach');
  const lastAgentProvider = [...messages].reverse().find((m) => m.role === 'agent')?.provider;
  const onStub = coachSetting?.effectiveProvider === 'stub' || lastAgentProvider === 'stub';
  // Proposals arrive as a flat list; they render under the agent turn that
  // produced them, which is where their rationale is.
  const proposalsByMessage = new Map<number, CoachProposal[]>();
  for (const p of detail?.proposals ?? []) {
    proposalsByMessage.set(p.messageId, [...(proposalsByMessage.get(p.messageId) ?? []), p]);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Select
          value={threadId ?? ''}
          onChange={(e) => setThreadId(e.target.value ? Number(e.target.value) : null)}
          className="min-w-0 flex-1"
        >
          {!threads?.items?.length && <option value="">{t('coach.noThreads')}</option>}
          {threads?.items?.map((th) => (
            <option key={th.id} value={th.id}>
              {th.title || t('coach.untitled')}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={createThread.isPending}
          onClick={() => void startThread()}
        >
          <Plus className="h-4 w-4" /> {t('coach.newThread')}
        </Button>
      </div>

      {/* Standing reminder that this channel proposes, never applies. Without it
          the chat reads as if the agent is learning on its own. */}
      <p className="mb-2 flex items-start gap-1 rounded-md bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {t('coach.approvalNotice')}
      </p>

      {onStub && (
        <p className="mb-2 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            <span className="font-semibold">{t('coach.stubWarningTitle')}</span>{' '}
            {t('coach.stubWarningBody')}
          </span>
        </p>
      )}

      <div
        ref={scrollRef}
        className="h-96 space-y-2 overflow-y-auto rounded-lg border border-gray-100 bg-white p-3"
      >
        {(threadsLoading || detailLoading) && <p className="text-sm text-gray-400">{tc('loading')}</p>}

        {!threadsLoading && !detailLoading && messages.length === 0 && (
          <div className="pt-12 text-center">
            <p className="text-sm text-gray-400">{t('coach.empty')}</p>
            <p className="mt-2 text-xs text-gray-400">{t('coach.emptyExample')}</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="flex flex-col">
            {m.refTurn && (
              <div className="mb-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600">
                <p className="font-semibold text-gray-500">{t('coach.referencedTurn')}</p>
                <p className="mt-1 whitespace-pre-wrap">
                  <span className="text-gray-400">{t('coach.refCustomer')} </span>
                  {m.refTurn.question}
                </p>
                <p className="whitespace-pre-wrap">
                  <span className="text-gray-400">{t('coach.refAgent')} </span>
                  {m.refTurn.answer}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.refTurn.confidence !== null && (
                    <Badge tone={m.refTurn.confidence >= 0.45 ? 'success' : 'warning'}>
                      conf {m.refTurn.confidence.toFixed(2)}
                    </Badge>
                  )}
                  {m.refTurn.citations.map((c) => (
                    <Badge key={c.id} tone="info">
                      {c.title.length > 24 ? `${c.title.slice(0, 24)}…` : c.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div
              className={cn(
                'max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm',
                m.role === 'user' ? 'ml-auto bg-primary-500 text-white' : 'mr-auto bg-gray-100 text-gray-800',
              )}
            >
              {m.blocked ? (
                <span className="text-amber-700">{t('coach.moderationBlocked')}</span>
              ) : (
                m.body
              )}
            </div>

            {/* Retrieved documents are rendered from the stored citation rows,
                not from anything the model said about them. */}
            {m.role === 'agent' && m.citations.length > 0 && (
              <div className="mr-auto mt-1 flex max-w-[90%] flex-wrap gap-1">
                {m.citations.map((c) => (
                  <Badge key={c.id} tone="info">
                    {c.title.length > 28 ? `${c.title.slice(0, 28)}…` : c.title}
                  </Badge>
                ))}
              </div>
            )}

            {(proposalsByMessage.get(m.id) ?? []).map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                // The question to re-ask is the referenced customer turn when
                // there is one, else the coaching message that produced it.
                onVerifyInPreview={
                  onVerifyInPreview
                    ? () => onVerifyInPreview(refQuestionFor(m.id) ?? m.body)
                    : undefined
                }
              />
            ))}
          </div>
        ))}

        {busy && <p className="text-xs text-gray-400">{t('coach.thinking')}</p>}
      </div>

      {/* An answer carried over from the preview tab, attached to the next turn. */}
      {target && (
        <div className="mt-2 rounded-lg border border-primary-200 bg-primary-50/40 px-2.5 py-2 text-[11px] text-gray-600">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-primary-700">{t('coach.attachedTurn')}</span>
            <button
              type="button"
              onClick={onClearTarget}
              className="rounded p-0.5 text-gray-400 hover:text-gray-600"
              aria-label={t('coach.detach')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap">
            <span className="text-gray-400">{t('coach.refAgent')} </span>
            {target.answer}
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
          }}
          placeholder={t('coach.placeholder')}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
        />
        <Button size="sm" onClick={() => void submit()} disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
