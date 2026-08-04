import { useState } from 'react';
import { AlertTriangle, Check, Pencil, Undo2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { cn } from '@/lib/cn';
import type { CoachProposal } from './coach.service';
import { useApplyProposal, useRejectProposal, useRevertProposal } from './coach.hooks';

interface ProposalCardProps {
  proposal: CoachProposal;
}

/**
 * One reviewable config change (FR-072). Nothing here writes on render — a
 * proposal only reaches the tenant config when a human presses Apply.
 */
export function ProposalCard({ proposal }: ProposalCardProps) {
  const { t } = useTranslation('aiSetting');
  const { t: tc } = useTranslation('common');
  const apply = useApplyProposal();
  const reject = useRejectProposal();
  const revert = useRevertProposal();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const isPersona = proposal.type === 'persona_patch';
  const proposedText = isPersona ? (proposal.persona ?? '') : (proposal.rule ?? '');
  const busy = apply.isPending || reject.isPending || revert.isPending;

  function openEditor() {
    setDraft(proposedText);
    setEditing(true);
  }

  function submitEdited() {
    apply.mutate({
      id: proposal.id,
      override: isPersona ? { persona: draft } : { rule: draft },
    });
    setEditing(false);
  }

  return (
    <div
      className={cn(
        'mr-auto mt-2 max-w-[95%] rounded-xl border px-3 py-2 text-sm',
        proposal.status === 'pending' && 'border-primary-200 bg-primary-50/40',
        proposal.status === 'applied' && 'border-emerald-200 bg-emerald-50/50',
        (proposal.status === 'rejected' || proposal.status === 'superseded') &&
          'border-gray-200 bg-gray-50 opacity-70',
        proposal.status === 'reverted' && 'border-amber-200 bg-amber-50/50',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Badge tone={proposal.status === 'pending' ? 'info' : 'gray'}>
          {t(`coach.type_${proposal.type}`)}
        </Badge>
        {proposal.status !== 'pending' && (
          <span className="text-[11px] text-gray-500">{t(`coach.status_${proposal.status}`)}</span>
        )}
      </div>

      {/* The change itself: removed line then added line, so the admin reads a
          diff rather than having to compare against the settings form. */}
      {proposal.targetRule && (
        <p className="whitespace-pre-wrap break-words text-xs text-error line-through">
          − {proposal.targetRule}
        </p>
      )}
      {proposedText && (
        <p className="whitespace-pre-wrap break-words text-xs text-gray-800">
          {proposal.targetRule || proposal.type === 'rule_add' ? '＋ ' : ''}
          {proposedText}
        </p>
      )}

      {proposal.rationale && (
        <p className="mt-1.5 text-[11px] text-gray-500">{proposal.rationale}</p>
      )}

      {proposal.conflictsWith.length > 0 && (
        <div className="mt-1.5 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <div>
            <span className="font-semibold">{t('coach.conflictWarning')}</span>
            <ul className="mt-0.5 list-disc pl-3">
              {proposal.conflictsWith.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {proposal.status === 'pending' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => apply.mutate({ id: proposal.id })}>
            <Check className="h-3.5 w-3.5" /> {t('coach.apply')}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={openEditor}>
            <Pencil className="h-3.5 w-3.5" /> {t('coach.applyEdited')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => reject.mutate({ id: proposal.id })}
          >
            <X className="h-3.5 w-3.5" /> {t('coach.dismiss')}
          </Button>
        </div>
      )}

      {proposal.status === 'applied' && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => revert.mutate({ id: proposal.id })}
          >
            <Undo2 className="h-3.5 w-3.5" /> {t('coach.revert')}
          </Button>
        </div>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('coach.editTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              {tc('cancel')}
            </Button>
            <Button disabled={!draft.trim() || busy} onClick={submitEdited}>
              {t('coach.applyThis')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t(`coach.type_${proposal.type}`)}</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={isPersona ? 10 : 4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-400">{t('coach.editHint')}</p>
        </div>
      </Modal>
    </div>
  );
}
