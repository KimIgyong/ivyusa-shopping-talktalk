import { useState } from 'react';
import { MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';
import { useComments, useCommentActions } from './live-chat.hooks';
import type { ChatComment } from './live-chat.service';

/**
 * Internal operator comments (REQ-260824 R4). Two scopes in one card:
 * conversation notes stay with this thread; session notes follow the shopper
 * into every later conversation of the same session. Console-only — nothing
 * here ever reaches the widget.
 */
export function CommentCard({ conversationId }: { conversationId: string | null }) {
  const { t } = useTranslation('livechat');
  const principal = useAuthStore((s) => s.principal);
  const { data: comments, isLoading } = useComments(conversationId);
  const actions = useCommentActions(conversationId);

  const [scope, setScope] = useState<'conversation' | 'session'>('conversation');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  /** Two-step delete: first tap arms, second confirms (no browser dialog). */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (!conversationId) return null;

  const myId = principal?.actorType === 'user' ? String(principal.id) : null;
  const isMaster = principal?.actorType === 'user' && principal.rank === 'master';
  const visible = (comments ?? []).filter((c) => c.scope === scope);
  const countOf = (s: ChatComment['scope']) =>
    (comments ?? []).filter((c) => c.scope === s).length;

  const submit = () => {
    const body = draft.trim();
    if (!body || actions.create.isPending) return;
    actions.create.mutate({ scope, body }, { onSuccess: () => setDraft('') });
  };

  const when = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <MessageSquareText className="h-4 w-4 text-primary-500" /> {t('comments.title')}
      </div>

      <div className="mb-2 flex gap-1">
        {(['conversation', 'session'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              scope === s
                ? 'bg-primary-500/10 text-primary-600'
                : 'text-gray-500 hover:bg-gray-100',
            )}
          >
            {t(`comments.scope.${s}`)} {countOf(s)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">{t('comments.loading')}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400">{t('comments.empty')}</p>
      ) : (
        <ul className="mb-2 max-h-64 space-y-2 overflow-y-auto">
          {visible.map((c) => {
            const mine = myId != null && String(c.authorId ?? '') === myId;
            return (
              <li key={c.id} className="rounded-md border border-gray-100 bg-gray-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-gray-500">
                    {c.authorName ?? t('comments.unknownAuthor')} · {when(c.createdAt)}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {mine && (
                      <button
                        type="button"
                        className="rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                        title={t('comments.edit')}
                        aria-label={t('comments.edit')}
                        onClick={() => {
                          setEditingId(c.id);
                          setEditDraft(c.body);
                          setConfirmingId(null);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    {(mine || isMaster) &&
                      (confirmingId === c.id ? (
                        <button
                          type="button"
                          className="rounded px-1 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
                          disabled={actions.remove.isPending}
                          onClick={() =>
                            actions.remove.mutate(c.id, {
                              onSettled: () => setConfirmingId(null),
                            })
                          }
                        >
                          {t('comments.confirmDelete')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-red-500"
                          title={t('comments.delete')}
                          aria-label={t('comments.delete')}
                          onClick={() => setConfirmingId(c.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ))}
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="mt-1 space-y-1">
                    <textarea
                      className="w-full rounded border border-primary-400 px-2 py-1 text-sm outline-none"
                      rows={2}
                      maxLength={2000}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                    />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        {t('comments.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!editDraft.trim() || actions.update.isPending}
                        onClick={() =>
                          actions.update.mutate(
                            { commentId: c.id, body: editDraft.trim() },
                            { onSuccess: () => setEditingId(null) },
                          )
                        }
                      >
                        {t('comments.save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{c.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-primary-500"
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(`comments.placeholder.${scope}`)}
        />
        <Button size="sm" disabled={!draft.trim() || actions.create.isPending} onClick={submit}>
          {t('comments.submit')}
        </Button>
      </div>
    </div>
  );
}
