import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';
import { issueService } from './issue.service';

const REJECT_REASONS = ['policy_impossible', 'misrouted', 'spam'] as const;

function statusTone(status?: string) {
  if (status === 'resolved') return 'success' as const;
  if (status === 'rejected') return 'error' as const;
  if (status === 'in_progress') return 'info' as const;
  if (status === 'closed') return 'gray' as const;
  return 'warning' as const; // received
}

/**
 * Issue P1 console surface (PLN-260808-Issue-Workflow-P1 S3): the conversation's
 * ticket badge + transitions + collapsible timeline, shown under the thread
 * header. Self-gating: non-native tenants get `issue: null` from the API and
 * render nothing — the pre-P1 console is untouched for them.
 */
export function IssuePanel({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation('livechat');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const [showTimeline, setShowTimeline] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string>(REJECT_REASONS[0]);
  const [note, setNote] = useState('');

  const { data } = useQuery({
    queryKey: ['issue', tenantKey, conversationId],
    queryFn: () => issueService.byConversation(conversationId),
    refetchInterval: 10_000,
  });
  const issue = data?.issue ?? null;

  const { data: eventsData } = useQuery({
    queryKey: ['issue-events', tenantKey, issue?.id],
    queryFn: () => issueService.events(issue!.id),
    enabled: !!issue && showTimeline,
  });

  const transition = useMutation({
    mutationFn: (v: { to: string; rejectReason?: string; note?: string }) =>
      issueService.transition(issue!.id, v.to, v.rejectReason, v.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', tenantKey, conversationId] });
      qc.invalidateQueries({ queryKey: ['issue-events', tenantKey] });
      setRejecting(false);
      setNote('');
      toast.success(t('issue.transitioned'));
    },
    onError: (e: Error) => toast.error(e.message || t('issue.transitionError'), { sticky: true }),
  });

  if (!issue) return null;

  const open = issue.status === 'received' || issue.status === 'in_progress';
  const settled = issue.status === 'resolved' || issue.status === 'rejected' || issue.status === 'closed';

  return (
    <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-700">#{issue.issueNo}</span>
        <Badge tone={statusTone(issue.status)}>{t(`issue.status.${issue.status}`)}</Badge>
        <span className="text-xs text-gray-400">{t(`issue.type.${issue.type}`)}</span>
        {issue.reopenCount > 0 && (
          <span className="text-xs text-gray-400">{t('issue.reopened', { count: issue.reopenCount })}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {open && (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={transition.isPending}
                onClick={() => transition.mutate({ to: 'resolved' })}
              >
                {t('issue.resolve')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={transition.isPending}
                onClick={() => setRejecting((v) => !v)}
              >
                {t('issue.reject')}
              </Button>
            </>
          )}
          {settled && (
            <Button
              size="sm"
              variant="secondary"
              disabled={transition.isPending}
              onClick={() => transition.mutate({ to: 'in_progress' })}
            >
              {t('issue.reopen')}
            </Button>
          )}
          <button
            className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
            onClick={() => setShowTimeline((v) => !v)}
          >
            {showTimeline ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t('issue.timeline')}
          </button>
        </div>
      </div>

      {rejecting && open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REJECT_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`issue.rejectReason.${r}`)}
              </option>
            ))}
          </select>
          <input
            className="min-w-[180px] flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs"
            placeholder={t('issue.notePlaceholder')}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            variant="danger"
            disabled={transition.isPending}
            onClick={() => transition.mutate({ to: 'rejected', rejectReason: reason, note: note || undefined })}
          >
            {t('issue.rejectConfirm')}
          </Button>
        </div>
      )}

      {showTimeline && (
        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
          {(eventsData?.events ?? []).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="whitespace-nowrap text-gray-400">
                {e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}
              </span>
              <span>
                {t(`issue.event.${e.type}`, { defaultValue: e.type })}
                {e.fromStatus && e.toStatus ? ` (${e.fromStatus}→${e.toStatus})` : ''}
                {e.note ? ` — ${e.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
