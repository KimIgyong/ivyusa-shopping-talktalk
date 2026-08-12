import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';
import { cn } from '@/lib/cn';
import { issueService } from '../live-chat/issue.service';
import { issuesBoardService, type IssueCard } from './issues-board.service';
import { IssuePreviewModal } from './IssuePreviewModal';

const COLUMNS = ['received', 'in_progress', 'resolved', 'rejected', 'closed'] as const;
const REJECT_REASONS = ['policy_impossible', 'misrouted', 'spam'] as const;

/** Allowed transitions per status (mirrors the server state machine, P1). */
const MOVES: Record<string, string[]> = {
  received: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'rejected'],
  resolved: ['closed', 'in_progress'],
  rejected: ['closed', 'in_progress'],
  closed: ['in_progress'],
};

function slaBadge(state: IssueCard['slaState']): string | null {
  if (state === 'overdue') return '🔥';
  if (state === 'warning') return '⚠️';
  return null;
}

/**
 * Kanban board (PLN-260809-Issue-Workflow-P4): status columns with native HTML5
 * drag&drop onto the existing P1 transition API — permissions and the state
 * machine stay server-enforced (an invalid drop just toasts and snaps back).
 * Non-native tenants see the add-on notice instead of an empty board.
 */
export function IssueBoardPage() {
  const { t } = useTranslation('livechat');
  const qc = useQueryClient();
  const tenantKey = useTenantKey();

  const { data: stats } = useQuery({
    queryKey: ['issue-stats', tenantKey],
    queryFn: () => issuesBoardService.stats(),
    refetchInterval: 30_000,
  });
  const { data: boardData } = useQuery({
    queryKey: ['issue-board', tenantKey],
    queryFn: () => issuesBoardService.board(),
    refetchInterval: 15_000,
  });
  const columns = boardData?.columns ?? {};
  // Clicking a card opens a read-only preview instead of leaving the board —
  // checking one issue used to cost the scroll position and filters (FR-4/5).
  const [previewing, setPreviewing] = useState<IssueCard | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['issue-board', tenantKey] });
    qc.invalidateQueries({ queryKey: ['issue-stats', tenantKey] });
  };
  const transition = useMutation({
    mutationFn: (v: { id: string; to: string; rejectReason?: string; note?: string }) =>
      issueService.transition(v.id, v.to, v.rejectReason, v.note),
    onSuccess: () => {
      invalidate();
      toast.success(t('issue.transitioned'));
    },
    onError: (e: Error) => toast.error(e.message || t('issue.transitionError'), { sticky: true }),
  });
  const priority = useMutation({
    mutationFn: (v: { id: string; priority: 'normal' | 'urgent' }) =>
      issuesBoardService.setPriority(v.id, v.priority),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message || t('issue.transitionError'), { sticky: true }),
  });

  // Reject drops need a reason (결정 3) — hold the pending move in a modal.
  const [rejecting, setRejecting] = useState<IssueCard | null>(null);
  const [reason, setReason] = useState<string>(REJECT_REASONS[0]);
  const [note, setNote] = useState('');

  const onDrop = (card: IssueCard, to: string) => {
    if (card.status === to) return;
    if (to === 'rejected') {
      setReason(REJECT_REASONS[0]);
      setNote('');
      setRejecting(card);
      return;
    }
    transition.mutate({ id: card.id, to });
  };

  if (stats && stats.workflowMode !== 'native') {
    return (
      <div>
        <PageHeader title={t('board.title')} subtitle={t('board.subtitle')} />
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          {t('board.notNative')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('board.title')} subtitle={t('board.subtitle')} />

      {/* KPI bar */}
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {COLUMNS.slice(0, 2).map((s) => (
          <span key={s} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5">
            {t(`issue.status.${s}`)} <b>{stats?.counts?.[s] ?? 0}</b>
          </span>
        ))}
        <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5">
          {t('board.unassigned')} <b>{stats?.unassigned ?? 0}</b>
        </span>
        <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5">
          {t('board.avgResolution')}{' '}
          <b>{stats?.avgResolutionHours != null ? `${stats.avgResolutionHours}h` : '—'}</b>
        </span>
        <span className="rounded-lg border border-gray-200 bg-white px-3 py-1.5">
          {t('board.reopenRate')}{' '}
          <b>{stats?.reopenRate != null ? `${stats.reopenRate}%` : '—'}</b>
        </span>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((status) => (
          <div
            key={status}
            className="rounded-lg border border-gray-200 bg-gray-50/60 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const card = JSON.parse(e.dataTransfer.getData('application/json')) as IssueCard;
                onDrop(card, status);
              } catch {
                /* foreign drop — ignore */
              }
            }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-gray-600">
                {t(`issue.status.${status}`)}
              </span>
              <span className="text-xs text-gray-400">{(columns[status] ?? []).length}</span>
            </div>
            <div className="space-y-2">
              {(columns[status] ?? []).map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData('application/json', JSON.stringify(card))
                  }
                  onClick={() => setPreviewing(card)}
                  className={cn(
                    'cursor-pointer rounded-lg border bg-white p-2.5 text-sm shadow-sm transition-colors hover:border-primary-400',
                    card.slaState === 'overdue' ? 'border-red-300' : 'border-gray-200',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-800">#{card.issueNo}</span>
                    <span className="text-xs text-gray-500">{t(`issue.type.${card.type}`)}</span>
                    {slaBadge(card.slaState) && <span>{slaBadge(card.slaState)}</span>}
                    {card.reopenCount > 0 && (
                      <span className="text-[11px] text-gray-400">↺{card.reopenCount}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                    <span className="shrink-0 text-gray-400">
                      {t('sessionLabel', { id: card.sessionId.slice(0, 6) })}
                    </span>
                    {card.sessionAlias && (
                      <span className="truncate font-medium text-gray-700">
                        · {card.sessionAlias}
                      </span>
                    )}
                  </div>
                  {card.preview && (
                    <p className="mt-0.5 truncate text-[11px] text-gray-500">{card.preview}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                    {card.assigneeLabel && (
                      <Badge tone="info">{t(`issue.label.${card.assigneeLabel}`, { defaultValue: card.assigneeLabel })}</Badge>
                    )}
                    <span className="truncate">{card.assigneeName ?? t('board.noAssignee')}</span>
                    {/* Touch-friendly move (백로그 B3): same transitions as drag. */}
                    <select
                      className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] text-gray-500"
                      value=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        const to = e.target.value;
                        if (to) onDrop(card, to);
                      }}
                    >
                      <option value="">{t('board.move')}</option>
                      {(MOVES[card.status] ?? []).map((to) => (
                        <option key={to} value={to}>
                          {t(`issue.status.${to}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        priority.mutate({
                          id: card.id,
                          priority: card.priority === 'urgent' ? 'normal' : 'urgent',
                        });
                      }}
                      className={cn(
                        'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        card.priority === 'urgent'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-gray-100 text-gray-500',
                      )}
                      title={t('board.priorityToggle')}
                    >
                      {card.priority === 'urgent' ? t('board.urgent') : t('board.normal')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <IssuePreviewModal card={previewing} onClose={() => setPreviewing(null)} />

      {/* Reject-reason modal (결정 3) */}
      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={t('issue.reject')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t('board.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={transition.isPending}
              onClick={() => {
                if (!rejecting) return;
                transition.mutate(
                  { id: rejecting.id, to: 'rejected', rejectReason: reason, note: note || undefined },
                  { onSuccess: () => setRejecting(null) },
                );
              }}
            >
              {t('issue.rejectConfirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <select
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
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
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            placeholder={t('issue.notePlaceholder')}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
